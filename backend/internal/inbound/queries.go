package inbound

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

type ListInboundDocumentsInput struct {
	OrganizationID uuid.UUID
	Status         string
	DocumentType   string
	Limit          int
}

// InboundDocumentListItem is a listing row plus the NF-e header fields the
// UI wants to show (access key, series/number, issuer CNPJ) without a
// separate round-trip per document. organization_nfe is 1:1 with
// organization_documents but a different table (spec's "root entity +
// per-type extension" split, 06_fiscal_documents.md) — left-joined here
// rather than folded into fiscal.Document itself, which stays document-type
// agnostic. Null for document_type=nfse (no equivalent extension joined).
type InboundDocumentListItem struct {
	fiscal.Document
	AccessKey         *string     `json:"access_key,omitempty"`
	Series            *string     `json:"series,omitempty"`
	Number            *string     `json:"number,omitempty"`
	IssuerCNPJ        *string     `json:"issuer_cnpj,omitempty"`
	RecipientDocument *string     `json:"recipient_document,omitempty"`
	IssuedAt          *time.Time  `json:"issued_at,omitempty"`
	IssuerName        *string     `json:"issuer_name,omitempty"`
	NFe               *NFeDetails `json:"nfe,omitempty"`
}

// ListInboundDocuments lists organization_documents with direction=inbound
// — the counterpart to fiscal.Service, which has no listing endpoint today
// (only get-by-id and timeline).
func (s *Service) ListInboundDocuments(ctx context.Context, in ListInboundDocumentsInput) ([]InboundDocumentListItem, error) {
	limit := in.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `
		select d.id, d.organization_id, d.organization_company_id, d.document_type, d.direction, d.environment,
		       d.external_id, d.source_system, d.source_document_id, d.idempotency_key, d.document_key,
		       d.status, d.processing_status, d.current_version, d.correlation_id, d.trace_id,
		       d.received_at, d.completed_at, d.created_at, d.updated_at,
		       n.access_key, n.series, n.number, n.issuer_cnpj, n.recipient_document,
		       n.issued_at, n.metadata_json #>> '{issuer,legal_name}'
		from organization_documents d
		left join organization_nfe n on n.organization_document_id = d.id
		where d.organization_id = $1 and d.direction = 'inbound'
	`
	args := []any{in.OrganizationID}
	if in.Status != "" {
		args = append(args, strings.ToUpper(in.Status))
		query += " and d.status = $" + strconv.Itoa(len(args))
	}
	if in.DocumentType != "" {
		args = append(args, in.DocumentType)
		query += " and d.document_type = $" + strconv.Itoa(len(args))
	}
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
			&d.IssuedAt, &d.IssuerName,
		); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, nil
}

// GetInboundDocument is the single-document counterpart of
// ListInboundDocuments — the nota fiscal detail screen's header (backend
// had no GET-by-id for fiscal_documents before; the detail page previously
// only existed as a table row, never independently loadable).
func (s *Service) GetInboundDocument(ctx context.Context, organizationID, documentID uuid.UUID) (InboundDocumentListItem, error) {
	var d InboundDocumentListItem
	var meta []byte
	err := s.pool.QueryRow(ctx, `
		select d.id, d.organization_id, d.organization_company_id, d.document_type, d.direction, d.environment,
		       d.external_id, d.source_system, d.source_document_id, d.idempotency_key, d.document_key,
		       d.status, d.processing_status, d.current_version, d.correlation_id, d.trace_id,
		       d.received_at, d.completed_at, d.created_at, d.updated_at,
		       n.access_key, n.series, n.number, n.issuer_cnpj, n.recipient_document,
		       n.issued_at, n.metadata_json #>> '{issuer,legal_name}', n.metadata_json
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
	)
	if err != nil {
		return d, err
	}
	if details := parseNFeDetails(meta); details != nil {
		d.NFe = details
	} else if d.DocumentType == "nfe" {
		s.ScheduleNFeEnrichment(organizationID, documentID)
	}
	return d, nil
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
	adapter, err := sap.Resolve(ctx, s.integrations, organizationID, &companyID)
	if err != nil {
		return nil, err
	}
	return adapter.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{
		PurchaseOrder: poNumber,
		VendorCNPJ:    vendorCNPJ,
		BranchCNPJ:    company.CNPJ,
	})
}
