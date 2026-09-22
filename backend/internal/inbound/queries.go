package inbound

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

type ListInboundDocumentsInput struct {
	OrganizationID uuid.UUID
	Status         string
	DocumentType   string
	Direction      string // "inbound" (default) or "outbound"
	Query          string
	Fields         string // comma-separated: number,partner,access_key
	Number         string
	Partner        string
	AccessKey      string
	Limit          int
}

// InboundDocumentListItem is a listing row plus the NF-e/NFS-e header fields
// the UI wants to show (access key, series/number, issuer CNPJ) without a
// separate round-trip per document. organization_nfe / organization_nfse are
// 1:1 with organization_documents (spec's "root entity + per-type extension"
// split, 06_fiscal_documents.md) — left-joined here rather than folded into
// fiscal.Document itself, which stays document-type agnostic.
type InboundDocumentListItem struct {
	fiscal.Document
	AccessKey            *string              `json:"access_key,omitempty"`
	Series               *string              `json:"series,omitempty"`
	Number               *string              `json:"number,omitempty"`
	IssuerCNPJ           *string              `json:"issuer_cnpj,omitempty"`
	RecipientDocument    *string              `json:"recipient_document,omitempty"`
	IssuedAt             *time.Time           `json:"issued_at,omitempty"`
	IssuerName           *string              `json:"issuer_name,omitempty"`
	AuthorizationCode    *string              `json:"authorization_code,omitempty"`
	AuthorizationMessage *string              `json:"authorization_message,omitempty"`
	NFe                  *NFeDetails          `json:"nfe,omitempty"`
	NFSe                 *NFSeDetails         `json:"nfse,omitempty"`
	Payloads             []DocumentPayloadRef `json:"payloads,omitempty"`
}

// DocumentPayloadRef is a stored XML/JSON blob the detail screen can preview
// or download (original SAP/UI payload, signed DPS/NF-e, SEFAZ/SEFIN reply).
type DocumentPayloadRef struct {
	PayloadType string `json:"payload_type"`
	ContentType string `json:"content_type"`
}

// ListInboundDocuments lists organization_documents filtered by direction
// (default inbound). Outbound NF-e saída reuses the same list endpoint with
// direction=outbound.
func (s *Service) ListInboundDocuments(ctx context.Context, in ListInboundDocumentsInput) ([]InboundDocumentListItem, error) {
	limit := in.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	direction := strings.ToLower(strings.TrimSpace(in.Direction))
	if direction == "" {
		direction = "inbound"
	}
	query := `
		select d.id, d.organization_id, d.organization_company_id, d.document_type, d.direction, d.environment,
		       d.external_id, d.source_system, d.source_document_id, d.idempotency_key, d.document_key,
		       d.status, d.processing_status, d.current_version, d.correlation_id, d.trace_id,
		       d.received_at, d.completed_at, d.created_at, d.updated_at,
		       coalesce(n.access_key, s.access_key),
		       coalesce(n.series, s.rps_series),
		       coalesce(n.number, s.nfse_number, s.rps_number),
		       coalesce(n.issuer_cnpj, s.provider_cnpj),
		       coalesce(n.recipient_document, s.taker_cnpj, s.taker_cpf),
		       coalesce(n.issued_at, s.emission_date, s.issued_at),
		       coalesce(nullif(n.issuer_legal_name, ''), n.metadata_json #>> '{issuer,legal_name}', c.legal_name),
		       coalesce(n.authorization_cstat, s.authorization_code),
		       coalesce(n.authorization_xmotivo, s.authorization_message)
		from organization_documents d
		left join organization_nfe n on n.organization_document_id = d.id
		left join organization_nfse s on s.organization_document_id = d.id
		left join organization_companies c on c.id = d.organization_company_id
		where d.organization_id = $1 and d.direction = $2
	`
	args := []any{in.OrganizationID, direction}
	if in.Status != "" {
		status := in.Status
		if direction == "inbound" {
			status = strings.ToUpper(status)
		} else {
			status = strings.ToLower(status)
		}
		args = append(args, status)
		query += " and d.status = $" + strconv.Itoa(len(args))
	}
	if in.DocumentType != "" {
		args = append(args, in.DocumentType)
		query += " and d.document_type = $" + strconv.Itoa(len(args))
	}
	query, args = applyListSearch(query, args, in)
	args = append(args, limit)
	query += " order by d.received_at desc limit $" + strconv.Itoa(len(args))

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []InboundDocumentListItem
	for rows.Next() {
		var d InboundDocumentListItem
		if err := rows.Scan(
			&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.DocumentType, &d.Direction, &d.Environment,
			&d.ExternalID, &d.SourceSystem, &d.SourceDocumentID, &d.IdempotencyKey, &d.DocumentKey,
			&d.Status, &d.ProcessingStatus, &d.CurrentVersion, &d.CorrelationID, &d.TraceID,
			&d.ReceivedAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
			&d.AccessKey, &d.Series, &d.Number, &d.IssuerCNPJ, &d.RecipientDocument,
			&d.IssuedAt, &d.IssuerName, &d.AuthorizationCode, &d.AuthorizationMessage,
		); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, nil
}

func applyListSearch(query string, args []any, in ListInboundDocumentsInput) (string, []any) {
	if q := clipFilter(in.Query); q != "" {
		fields := parseSearchFields(in.Fields)
		var parts []string
		if fields["number"] {
			var clause string
			args, clause = listNumberClause(args, q)
			parts = append(parts, clause)
		}
		if fields["partner"] {
			var clause string
			args, clause = listPartnerClause(args, q)
			parts = append(parts, clause)
		}
		if fields["access_key"] {
			if next, clause, ok := listAccessKeyClause(args, q); ok {
				args = next
				parts = append(parts, clause)
			}
		}
		if len(parts) > 0 {
			query += " and (" + strings.Join(parts, " or ") + ")"
		}
		return query, args
	}
	if number := clipFilter(in.Number); number != "" {
		var clause string
		args, clause = listNumberClause(args, number)
		query += " and " + clause
	}
	if partner := clipFilter(in.Partner); partner != "" {
		var clause string
		args, clause = listPartnerClause(args, partner)
		query += " and " + clause
	}
	if next, clause, ok := listAccessKeyClause(args, in.AccessKey); ok {
		args = next
		query += " and " + clause
	}
	return query, args
}

func parseSearchFields(raw string) map[string]bool {
	out := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		switch strings.TrimSpace(strings.ToLower(part)) {
		case "number", "numero":
			out["number"] = true
		case "partner", "parceiro":
			out["partner"] = true
		case "access_key", "chave":
			out["access_key"] = true
		}
	}
	if len(out) == 0 {
		return map[string]bool{"number": true, "partner": true, "access_key": true}
	}
	return out
}

func listNumberClause(args []any, value string) ([]any, string) {
	args = append(args, "%"+value+"%")
	ph := strconv.Itoa(len(args))
	return args, "(coalesce(n.number, s.nfse_number, s.rps_number, '') ilike $" + ph +
		" or coalesce(n.series, s.rps_series, '') ilike $" + ph + ")"
}

func listPartnerClause(args []any, value string) ([]any, string) {
	args = append(args, "%"+value+"%")
	namePH := strconv.Itoa(len(args))
	clause := "(" +
		"coalesce(n.issuer_legal_name, '') ilike $" + namePH +
		" or coalesce(n.recipient_legal_name, '') ilike $" + namePH +
		" or coalesce(s.taker_legal_name, '') ilike $" + namePH +
		" or coalesce(n.metadata_json #>> '{issuer,legal_name}', '') ilike $" + namePH +
		" or coalesce(n.metadata_json #>> '{recipient,legal_name}', '') ilike $" + namePH +
		" or coalesce(c.legal_name, '') ilike $" + namePH
	if digits := filterDigits(value); len(digits) >= 3 {
		args = append(args, "%"+digits+"%")
		docPH := strconv.Itoa(len(args))
		clause += " or regexp_replace(coalesce(n.issuer_cnpj, ''), '[^0-9]', '', 'g') like $" + docPH +
			" or regexp_replace(coalesce(n.recipient_document, ''), '[^0-9]', '', 'g') like $" + docPH +
			" or regexp_replace(coalesce(s.provider_cnpj, ''), '[^0-9]', '', 'g') like $" + docPH +
			" or regexp_replace(coalesce(s.taker_cnpj, s.taker_cpf, ''), '[^0-9]', '', 'g') like $" + docPH
	}
	return args, clause + ")"
}

func listAccessKeyClause(args []any, value string) ([]any, string, bool) {
	key := filterAlnum(value)
	if key == "" {
		return args, "", false
	}
	args = append(args, "%"+key+"%")
	return args, "regexp_replace(upper(trim(coalesce(n.access_key, s.access_key, ''))), '[^0-9A-Z]', '', 'g') like $" + strconv.Itoa(len(args)), true
}

func clipFilter(v string) string {
	v = strings.TrimSpace(v)
	runes := []rune(v)
	if len(runes) > 80 {
		return string(runes[:80])
	}
	return v
}

func filterDigits(v string) string {
	var b strings.Builder
	for _, r := range v {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func filterAlnum(v string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(strings.TrimSpace(v)) {
		if (r >= '0' && r <= '9') || (r >= 'A' && r <= 'Z') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// GetInboundDocument is the single-document counterpart of
// ListInboundDocuments — the nota fiscal detail screen's header (backend
// had no GET-by-id for fiscal_documents before; the detail page previously
// only existed as a table row, never independently loadable).
func (s *Service) GetInboundDocument(ctx context.Context, organizationID, documentID uuid.UUID) (InboundDocumentListItem, error) {
	var d InboundDocumentListItem
	var meta []byte
	var issuerLegal, issuerTrade, issuerIE, issuerIM, issuerCRT *string
	var issuerStreet, issuerNumber, issuerComplement, issuerDistrict *string
	var issuerCityCode, issuerCity, issuerUF, issuerCEP, issuerPhone *string
	var recipientLegal, recipientIE, recipientIM *string
	var recipientStreet, recipientNumber, recipientComplement, recipientDistrict *string
	var recipientCityCode, recipientCity, recipientUF, recipientCEP, recipientPhone *string
	var nature, opType, finality *string
	var totalProducts, totalFreight, totalInsurance, totalDiscount, totalOther, totalNF *float64
	var totalICMSBase, totalICMS, totalICMSST, totalFCP, totalIPI, totalPIS, totalCOFINS, totalII *float64
	var totalIBS, totalCBS, totalIS *float64

	err := s.pool.QueryRow(ctx, `
		select d.id, d.organization_id, d.organization_company_id, d.document_type, d.direction, d.environment,
		       d.external_id, d.source_system, d.source_document_id, d.idempotency_key, d.document_key,
		       d.status, d.processing_status, d.current_version, d.correlation_id, d.trace_id,
		       d.received_at, d.completed_at, d.created_at, d.updated_at,
		       n.access_key, n.series, n.number, n.issuer_cnpj, n.recipient_document,
		       n.issued_at,
		       coalesce(nullif(n.issuer_legal_name, ''), n.metadata_json #>> '{issuer,legal_name}'),
		       n.metadata_json,
		       n.issuer_legal_name, n.issuer_trade_name, n.issuer_ie, n.issuer_im, n.issuer_crt,
		       n.issuer_street, n.issuer_number, n.issuer_complement, n.issuer_district,
		       n.issuer_city_code, n.issuer_city, n.issuer_uf, n.issuer_cep, n.issuer_phone,
		       n.recipient_legal_name, n.recipient_ie, n.recipient_im,
		       n.recipient_street, n.recipient_number, n.recipient_complement, n.recipient_district,
		       n.recipient_city_code, n.recipient_city, n.uf_recipient, n.recipient_cep, n.recipient_phone,
		       n.nature_of_operation, n.operation_type, n.finality,
		       n.total_products, n.total_freight, n.total_insurance, n.total_discount, n.total_other, n.total_nf,
		       n.total_icms_base, n.total_icms, n.total_icms_st, n.total_fcp, n.total_ipi, n.total_pis, n.total_cofins, n.total_ii,
		       n.total_ibs, n.total_cbs, n.total_is
		from organization_documents d
		left join organization_nfe n on n.organization_document_id = d.id
		where d.organization_id = $1 and d.id = $2
	`, organizationID, documentID).Scan(
		&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.DocumentType, &d.Direction, &d.Environment,
		&d.ExternalID, &d.SourceSystem, &d.SourceDocumentID, &d.IdempotencyKey, &d.DocumentKey,
		&d.Status, &d.ProcessingStatus, &d.CurrentVersion, &d.CorrelationID, &d.TraceID,
		&d.ReceivedAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
		&d.AccessKey, &d.Series, &d.Number, &d.IssuerCNPJ, &d.RecipientDocument,
		&d.IssuedAt, &d.IssuerName, &meta,
		&issuerLegal, &issuerTrade, &issuerIE, &issuerIM, &issuerCRT,
		&issuerStreet, &issuerNumber, &issuerComplement, &issuerDistrict,
		&issuerCityCode, &issuerCity, &issuerUF, &issuerCEP, &issuerPhone,
		&recipientLegal, &recipientIE, &recipientIM,
		&recipientStreet, &recipientNumber, &recipientComplement, &recipientDistrict,
		&recipientCityCode, &recipientCity, &recipientUF, &recipientCEP, &recipientPhone,
		&nature, &opType, &finality,
		&totalProducts, &totalFreight, &totalInsurance, &totalDiscount, &totalOther, &totalNF,
		&totalICMSBase, &totalICMS, &totalICMSST, &totalFCP, &totalIPI, &totalPIS, &totalCOFINS, &totalII,
		&totalIBS, &totalCBS, &totalIS,
	)
	if err != nil {
		return d, err
	}
	if err := s.attachAuthorizationAndPayloads(ctx, organizationID, documentID, &d); err != nil {
		return d, err
	}
	if details := parseNFeDetails(meta); details != nil {
		d.NFe = details
	} else if d.DocumentType == "nfe" {
		if built := nfeDetailsFromColumns(
			ptrStr(d.IssuerCNPJ), issuerLegal, issuerTrade, issuerIE, issuerIM, issuerCRT,
			issuerStreet, issuerNumber, issuerComplement, issuerDistrict, issuerCityCode, issuerCity, issuerUF, issuerCEP, issuerPhone,
			ptrStr(d.RecipientDocument), recipientLegal, recipientIE, recipientIM,
			recipientStreet, recipientNumber, recipientComplement, recipientDistrict, recipientCityCode, recipientCity, recipientUF, recipientCEP, recipientPhone,
			nature, opType, finality,
			totalProducts, totalFreight, totalInsurance, totalDiscount, totalOther, totalNF,
			totalICMSBase, totalICMS, totalICMSST, totalFCP, totalIPI, totalPIS, totalCOFINS, totalII,
			totalIBS, totalCBS, totalIS,
		); built != nil {
			d.NFe = built
		} else if d.Direction == "inbound" {
			s.ScheduleNFeEnrichment(organizationID, documentID)
		}
	}
	return d, nil
}

func (s *Service) attachAuthorizationAndPayloads(ctx context.Context, organizationID, documentID uuid.UUID, d *InboundDocumentListItem) error {
	if strings.EqualFold(d.DocumentType, "nfse") {
		if err := s.attachNFSeDetails(ctx, organizationID, documentID, d); err != nil {
			return err
		}
	} else {
		var authCode, authMsg *string
		err := s.pool.QueryRow(ctx, `
			select authorization_cstat, authorization_xmotivo
			from organization_nfe
			where organization_id = $1 and organization_document_id = $2
		`, organizationID, documentID).Scan(&authCode, &authMsg)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err == nil {
			d.AuthorizationCode = authCode
			d.AuthorizationMessage = authMsg
		}
	}

	rows, err := s.pool.Query(ctx, `
		select payload_type, content_type
		from organization_document_payloads
		where organization_id = $1 and organization_document_id = $2
		order by created_at
	`, organizationID, documentID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ref DocumentPayloadRef
		if err := rows.Scan(&ref.PayloadType, &ref.ContentType); err != nil {
			return err
		}
		d.Payloads = append(d.Payloads, ref)
	}
	return rows.Err()
}

func (s *Service) attachNFSeDetails(ctx context.Context, organizationID, documentID uuid.UUID, d *InboundDocumentListItem) error {
	var accessKey, series, number, issuer, recipient, authCode, authMsg *string
	var issuedAt *time.Time
	var providerIM, providerMun *string
	var companyName, companyTrade, companyIM, companyUF, companyCityCode *string
	var takerCPF, takerCNPJ, takerLegal, takerIM, takerPhone, takerEmail *string
	var takerStreet, takerNumber, takerComplement, takerDistrict, takerMun, takerUF, takerCEP *string
	var discrimination, nbs, listItem, munTax, serviceMun, cnae, nature, pisCST, pisRet *string
	var serviceAmount, issRate, issAmount, pisAmount, cofinsAmount, totTrib *float64
	var issWithheld *bool

	err := s.pool.QueryRow(ctx, `
		select s.access_key, s.rps_series, coalesce(nullif(s.nfse_number, ''), s.rps_number),
		       s.provider_cnpj, coalesce(s.taker_cnpj, s.taker_cpf), coalesce(s.emission_date, s.issued_at),
		       s.authorization_code, s.authorization_message,
		       s.provider_im, s.provider_municipality_code,
		       c.legal_name, c.trade_name, c.municipal_registration, c.uf, c.ibge_municipality_code,
		       s.taker_cpf, s.taker_cnpj, s.taker_legal_name, s.taker_im, s.taker_phone, s.taker_email,
		       s.taker_street, s.taker_number, s.taker_complement, s.taker_district,
		       s.taker_municipality_code, s.taker_uf, s.taker_cep,
		       s.discrimination, s.nbs_code, s.service_list_item, s.municipal_tax_code,
		       s.service_municipality_code, s.cnae_code, s.nature_of_operation,
		       s.service_amount, s.iss_withheld, s.iss_rate, s.iss_amount,
		       s.pis_cofins_tax_situation, s.pis_cofins_withholding_type,
		       s.pis_amount, s.cofins_amount, s.total_taxes_percent
		from organization_nfse s
		left join organization_companies c
		  on c.id = $3 and c.organization_id = s.organization_id
		where s.organization_id = $1 and s.organization_document_id = $2
	`, organizationID, documentID, d.OrganizationCompanyID).Scan(
		&accessKey, &series, &number, &issuer, &recipient, &issuedAt, &authCode, &authMsg,
		&providerIM, &providerMun,
		&companyName, &companyTrade, &companyIM, &companyUF, &companyCityCode,
		&takerCPF, &takerCNPJ, &takerLegal, &takerIM, &takerPhone, &takerEmail,
		&takerStreet, &takerNumber, &takerComplement, &takerDistrict, &takerMun, &takerUF, &takerCEP,
		&discrimination, &nbs, &listItem, &munTax, &serviceMun, &cnae, &nature,
		&serviceAmount, &issWithheld, &issRate, &issAmount,
		&pisCST, &pisRet, &pisAmount, &cofinsAmount, &totTrib,
	)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err != nil {
		return nil
	}
	if d.AccessKey == nil {
		d.AccessKey = accessKey
	}
	if d.Series == nil {
		d.Series = series
	}
	if d.Number == nil {
		d.Number = number
	}
	if d.IssuerCNPJ == nil {
		d.IssuerCNPJ = issuer
	}
	if d.RecipientDocument == nil {
		d.RecipientDocument = recipient
	}
	if d.IssuedAt == nil {
		d.IssuedAt = issuedAt
	}
	d.AuthorizationCode = authCode
	d.AuthorizationMessage = authMsg
	if d.IssuerName == nil || strings.TrimSpace(*d.IssuerName) == "" {
		if name := ptrText(companyName); name != "" {
			d.IssuerName = &name
		}
	}
	im := firstNonEmpty(ptrText(providerIM), ptrText(companyIM))
	var issuerIM *string
	if im != "" {
		issuerIM = &im
	}
	cityCode := firstNonEmpty(ptrText(companyCityCode), ptrText(providerMun))
	var issuerCity *string
	if cityCode != "" {
		issuerCity = &cityCode
	}
	d.NFSe = buildNFSeDetails(
		issuer, companyName, companyTrade, issuerIM, companyUF, issuerCity,
		takerCNPJ, takerCPF, takerLegal, takerIM, takerPhone, takerEmail,
		takerStreet, takerNumber, takerComplement, takerDistrict, takerMun, takerUF, takerCEP,
		discrimination, nbs, listItem, munTax, serviceMun, cnae, nature, pisCST, pisRet,
		serviceAmount, issRate, issAmount, pisAmount, cofinsAmount, totTrib,
		issWithheld, d.IssuerCNPJ,
	)
	return nil
}

func ptrStr(p *string) *string { return p }

func nfeDetailsFromColumns(
	issuerCNPJ, issuerLegal, issuerTrade, issuerIE, issuerIM, issuerCRT *string,
	issuerStreet, issuerNumber, issuerComplement, issuerDistrict, issuerCityCode, issuerCity, issuerUF, issuerCEP, issuerPhone *string,
	recipientDoc, recipientLegal, recipientIE, recipientIM *string,
	recipientStreet, recipientNumber, recipientComplement, recipientDistrict, recipientCityCode, recipientCity, recipientUF, recipientCEP, recipientPhone *string,
	nature, opType, finality *string,
	totalProducts, totalFreight, totalInsurance, totalDiscount, totalOther, totalNF *float64,
	totalICMSBase, totalICMS, totalICMSST, totalFCP, totalIPI, totalPIS, totalCOFINS, totalII *float64,
	totalIBS, totalCBS, totalIS *float64,
) *NFeDetails {
	details := NFeDetails{
		Issuer: NFeParty{
			CNPJ: deref(issuerCNPJ), LegalName: deref(issuerLegal), TradeName: deref(issuerTrade),
			IE: deref(issuerIE), IM: deref(issuerIM), CRT: deref(issuerCRT),
			Address: addressOrNil(issuerStreet, issuerNumber, issuerComplement, issuerDistrict, issuerCityCode, issuerCity, issuerUF, issuerCEP, issuerPhone),
		},
		Recipient: NFeParty{
			CNPJ: deref(recipientDoc), LegalName: deref(recipientLegal),
			IE: deref(recipientIE), IM: deref(recipientIM),
			Address: addressOrNil(recipientStreet, recipientNumber, recipientComplement, recipientDistrict, recipientCityCode, recipientCity, recipientUF, recipientCEP, recipientPhone),
		},
		NatureOfOperation: deref(nature),
		OperationType:     deref(opType),
		Finality:          deref(finality),
	}
	if totalNF != nil || totalProducts != nil || totalIBS != nil || totalCBS != nil {
		details.Totals = &NFeTotals{
			Products: derefF(totalProducts), Freight: derefF(totalFreight), Insurance: derefF(totalInsurance),
			Discount: derefF(totalDiscount), Other: derefF(totalOther), NF: derefF(totalNF),
			ICMSBase: derefF(totalICMSBase), ICMS: derefF(totalICMS), ICMSST: derefF(totalICMSST),
			FCP: derefF(totalFCP), IPI: derefF(totalIPI), PIS: derefF(totalPIS), COFINS: derefF(totalCOFINS), II: derefF(totalII),
			IBS: derefF(totalIBS), CBS: derefF(totalCBS), IS: derefF(totalIS),
		}
	}
	if details.Empty() {
		return nil
	}
	return &details
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func derefF(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

func addressOrNil(street, number, complement, district, cityCode, city, uf, cep, phone *string) *NFeAddress {
	a := NFeAddress{
		Street: deref(street), Number: deref(number), Complement: deref(complement),
		District: deref(district), CityCode: deref(cityCode), City: deref(city),
		UF: deref(uf), CEP: deref(cep), Phone: deref(phone),
	}
	if a.Street == "" && a.City == "" && a.UF == "" {
		return nil
	}
	return &a
}

func parseNFeDetails(meta []byte) *NFeDetails {
	if len(meta) == 0 || string(meta) == "{}" || string(meta) == "null" {
		return nil
	}
	var details NFeDetails
	if err := json.Unmarshal(meta, &details); err != nil || details.Empty() {
		return nil
	}
	return &details
}

// SearchPurchaseOrders proxies to the resolved SAP adapter for the
// document's company — the interactive search a user runs to manually pick
// a purchase order when automatic matching couldn't (spec §12-13, "buscar
// pedidos SAP interativamente"). The real CPI search (see cpi_client.go's
// nexusPurchaseOrder) is scoped by receiving branch, not just vendor, so the
// company's own CNPJ is resolved here and passed through.
func (s *Service) SearchPurchaseOrders(ctx context.Context, organizationID, documentID uuid.UUID, poNumber, vendorCNPJ string) ([]sap.PurchaseOrder, error) {
	doc, err := s.fiscal.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	companyID := doc.OrganizationCompanyID
	company, err := s.orgs.GetCompany(ctx, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	adapter, err := s.resolveSAP(ctx, organizationID, &companyID)
	if err != nil {
		return nil, err
	}
	return adapter.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{
		PurchaseOrder: poNumber,
		VendorCNPJ:    vendorCNPJ,
		BranchCNPJ:    company.CNPJ,
	})
}
