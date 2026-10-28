package fiscal

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/nfseprovider"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// CancelNFSeInput is the body for POST .../fiscal_documents/{id}/cancel (NFS-e).
type CancelNFSeInput struct {
	CMotivo       string `json:"c_motivo"`
	Justificativa string `json:"justificativa"`
}

type nfseCancelMaterial struct {
	AccessKey        string
	CNPJ             string
	NFSeNumber       string
	ProviderCode     string
	ProviderConfig   json.RawMessage
	MunicipalityCode string
}

// RequestCancelNFSe moves an authorized outbound NFS-e to cancel_requested and
// enqueues fiscal.document.cancel_requested.v1 for the nfe-gateway SEFIN path.
func (s *Service) RequestCancelNFSe(
	ctx context.Context,
	organizationID, documentID uuid.UUID,
	in CancelNFSeInput,
	actorType, actorID string,
) (*Document, error) {
	cMotivo := strings.TrimSpace(in.CMotivo)
	justificativa := strings.TrimSpace(in.Justificativa)
	if cMotivo != "1" && cMotivo != "2" && cMotivo != "9" {
		return nil, domainerr.Validation("invalid_c_motivo", "c_motivo must be 1 (erro na emissão), 2 (serviço não prestado) or 9 (outros)")
	}
	if len([]rune(justificativa)) < 15 {
		return nil, domainerr.Validation("justificativa_too_short", "justificativa must be at least 15 characters")
	}
	if len([]rune(justificativa)) > 255 {
		justificativa = string([]rune(justificativa)[:255])
	}

	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(doc.DocumentType, "nfse") {
		return nil, domainerr.Validation("not_nfse", "Only NFS-e documents can be cancelled through this endpoint")
	}
	if !strings.EqualFold(doc.Direction, "outbound") {
		return nil, domainerr.Validation("not_outbound", "Only outbound NFS-e can be cancelled by the issuer")
	}
	if !strings.EqualFold(doc.Status, StatusAuthorized) {
		return nil, domainerr.Conflict("document_not_cancellable", "Only authorized NFS-e documents can be cancelled")
	}

	material, err := s.loadNFSeCancelMaterial(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	provider, ok := nfseprovider.Lookup(material.ProviderCode)
	if !ok {
		return nil, domainerr.Validation("nfse_provider_unknown", "Provedor de NFS-e '"+material.ProviderCode+"' não é suportado")
	}
	switch provider.IdentifiesBy {
	case nfseprovider.IdentifiesByNumber:
		if material.NFSeNumber == "" {
			return nil, domainerr.Validation("missing_nfse_number", "NFS-e number is required before cancel")
		}
	default:
		if material.AccessKey == "" {
			return nil, domainerr.Validation("missing_access_key", "NFS-e access key is required before cancel")
		}
	}
	if material.CNPJ == "" {
		company, companyErr := s.orgs.GetCompany(ctx, organizationID, doc.OrganizationCompanyID)
		if companyErr != nil {
			return nil, companyErr
		}
		material.CNPJ = digitsOnly(company.CNPJ)
	}
	if len(material.CNPJ) != 14 {
		return nil, domainerr.Validation("missing_provider_cnpj", "Provider CNPJ is required before cancel")
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = null,
			    updated_at = $5,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $6 and direction = 'outbound'
		`, organizationID, documentID, StatusCancelRequested, ProcessingWaiting, now, StatusAuthorized)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}

		meta, _ := json.Marshal(map[string]any{
			"c_motivo":      cMotivo,
			"justificativa": justificativa,
			"access_key":    material.AccessKey,
		})
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, messaging.EventDocumentCancelRequested, StatusAuthorized, StatusCancelRequested,
			actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}

		outbox := map[string]any{
			"document_id":             documentID,
			"organization_company_id": doc.OrganizationCompanyID,
			"document_type":           "nfse",
			"environment":             doc.Environment,
			"access_key":              material.AccessKey,
			"cnpj":                    material.CNPJ,
			"c_motivo":                cMotivo,
			"justificativa":           justificativa,
			"n_seq_evento":            1,
			"nfse_provider":           provider.Code,
			"nfse_number":             material.NFSeNumber,
		}
		if material.MunicipalityCode != "" {
			outbox["municipality_code"] = material.MunicipalityCode
		}
		if len(material.ProviderConfig) > 0 {
			outbox["nfse_provider_config"] = material.ProviderConfig
		}
		if objectKey, keyErr := s.OriginalPayloadObjectKey(ctx, documentID); keyErr == nil && objectKey != "" {
			outbox["payload_object_key"] = objectKey
		}

		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, messaging.EventDocumentCancelRequested, outbox)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetDocument(ctx, organizationID, documentID)
}

func (s *Service) loadNFSeCancelMaterial(ctx context.Context, organizationID, documentID uuid.UUID) (nfseCancelMaterial, error) {
	var accessKey, providerCNPJ, nfseNumber, providerCode, municipality *string
	var providerConfig []byte
	err := s.pool.QueryRow(ctx, `
		select nullif(trim(access_key), ''), nullif(trim(provider_cnpj), ''),
		       nullif(trim(nfse_number), ''), nullif(trim(provider_code), ''), provider_config,
		       coalesce(nullif(provider_municipality_code, ''), nullif(municipality_code, ''), nullif(service_municipality_code, ''))
		from organization_nfse
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID).Scan(&accessKey, &providerCNPJ, &nfseNumber, &providerCode, &providerConfig, &municipality)
	if err == pgx.ErrNoRows {
		return nfseCancelMaterial{}, domainerr.NotFound("nfse_extension_not_found", "NFS-e extension row not found")
	}
	if err != nil {
		return nfseCancelMaterial{}, err
	}
	out := nfseCancelMaterial{}
	if accessKey != nil {
		out.AccessKey = normalizeAccessKey(*accessKey)
	}
	if providerCNPJ != nil {
		out.CNPJ = digitsOnly(*providerCNPJ)
	}
	if nfseNumber != nil {
		out.NFSeNumber = normalizeNFSeNumber(*nfseNumber)
	}
	if municipality != nil {
		out.MunicipalityCode = strings.TrimSpace(*municipality)
	}
	if len(providerConfig) > 0 && string(providerConfig) != "null" {
		out.ProviderConfig = json.RawMessage(providerConfig)
	}
	storedCode := ""
	if providerCode != nil {
		storedCode = strings.TrimSpace(*providerCode)
	}
	catalogCode := ""
	catalogEnabled := false
	if storedCode == "" && out.MunicipalityCode != "" {
		route, routeErr := s.municipalCancelRoute(ctx, out.MunicipalityCode)
		if routeErr != nil {
			return nfseCancelMaterial{}, routeErr
		}
		catalogCode = route.code
		catalogEnabled = route.enabled
		if len(out.ProviderConfig) == 0 && route.enabled && len(route.config) > 0 && string(route.config) != "null" {
			out.ProviderConfig = route.config
		}
	}
	out.ProviderCode = chooseNFSeCancelProvider(storedCode, catalogCode, catalogEnabled)
	return out, nil
}

// chooseNFSeCancelProvider keeps the provider frozen on the note. When the
// note has none, an enabled municipal catalog row (Garuva → IPM) wins;
// otherwise the cancel goes to SEFIN Nacional.
func chooseNFSeCancelProvider(storedCode, catalogCode string, catalogEnabled bool) string {
	if strings.TrimSpace(storedCode) != "" {
		return nfseprovider.NormalizeCode(storedCode)
	}
	if catalogEnabled && strings.TrimSpace(catalogCode) != "" {
		if _, ok := nfseprovider.Lookup(catalogCode); ok {
			return nfseprovider.NormalizeCode(catalogCode)
		}
	}
	return nfseprovider.CodeSefinNacional
}

type municipalCancelRoute struct {
	code    string
	config  json.RawMessage
	enabled bool
}

func (s *Service) municipalCancelRoute(ctx context.Context, municipality string) (municipalCancelRoute, error) {
	municipality = strings.TrimSpace(municipality)
	if len(municipality) != 7 {
		return municipalCancelRoute{}, nil
	}
	var code string
	var cfg []byte
	var enabled bool
	err := s.pool.QueryRow(ctx, `
		select provider_code, provider_config, enabled
		from nfse_municipal_providers
		where ibge_municipality_code = $1
	`, municipality).Scan(&code, &cfg, &enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return municipalCancelRoute{}, nil
	}
	if err != nil {
		return municipalCancelRoute{}, err
	}
	return municipalCancelRoute{code: code, config: json.RawMessage(cfg), enabled: enabled}, nil
}

func digitsOnly(v string) string {
	var b strings.Builder
	for _, r := range v {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeAccessKey(v string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(v) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(unicode.ToUpper(r))
		}
	}
	return b.String()
}
