package fiscal

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// CancelNFeInput is the body for POST .../fiscal_documents/{id}/cancel (NF-e).
type CancelNFeInput struct {
	Justificativa string `json:"justificativa"`
}

// CCeInput is the body for POST .../fiscal_documents/{id}/cce.
type CCeInput struct {
	Correcao   string `json:"correcao"`
	NSeqEvento int    `json:"n_seq_evento"`
}

// InutilizationInput is company-scoped (série + faixa).
type InutilizationInput struct {
	OrganizationCompanyID uuid.UUID `json:"organization_company_id"`
	Serie                 string    `json:"serie"`
	NumeroInicial         int       `json:"numero_inicial"`
	NumeroFinal           int       `json:"numero_final"`
	Ano                   int       `json:"ano"`
	Justificativa         string    `json:"justificativa"`
	DocumentID            *uuid.UUID `json:"document_id,omitempty"`
}

type nfeEventMaterial struct {
	AccessKey string
	Protocol  string
	CNPJ      string
	UF        string
}

// RequestCancelNFe enqueues fiscal.document.cancel_requested.v1 for outbound NF-e.
func (s *Service) RequestCancelNFe(
	ctx context.Context,
	organizationID, documentID uuid.UUID,
	in CancelNFeInput,
	actorType, actorID string,
) (*Document, error) {
	justificativa := strings.TrimSpace(in.Justificativa)
	if len([]rune(justificativa)) < 15 {
		return nil, domainerr.Validation("justificativa_too_short", "justificativa must be at least 15 characters")
	}
	if len([]rune(justificativa)) > 255 {
		justificativa = string([]rune(justificativa)[:255])
	}

	doc, err := s.requireOutboundAuthorizedNFe(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	material, err := s.loadNFeEventMaterial(ctx, organizationID, documentID, doc)
	if err != nil {
		return nil, err
	}
	if material.Protocol == "" {
		return nil, domainerr.Validation("missing_protocol", "Authorization protocol is required before cancel")
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3, processing_status = $4, completed_at = null, updated_at = $5, version = version + 1
			where organization_id = $1 and id = $2 and status = $6 and direction = 'outbound'
		`, organizationID, documentID, StatusCancelRequested, ProcessingWaiting, now, StatusAuthorized)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			// Also allow cancel from correction_registered
			tag, err = tx.Exec(ctx, `
				update organization_documents
				set status = $3, processing_status = $4, completed_at = null, updated_at = $5, version = version + 1
				where organization_id = $1 and id = $2 and status = $6 and direction = 'outbound'
			`, organizationID, documentID, StatusCancelRequested, ProcessingWaiting, now, StatusCorrectionRegistered)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
			}
		}

		meta, _ := json.Marshal(map[string]any{
			"justificativa": justificativa,
			"access_key":    material.AccessKey,
			"protocol":      material.Protocol,
		})
		fromStatus := doc.Status
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, messaging.EventDocumentCancelRequested, fromStatus, StatusCancelRequested,
			actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}

		outbox := map[string]any{
			"document_id":             documentID,
			"organization_company_id": doc.OrganizationCompanyID,
			"document_type":           "nfe",
			"environment":             doc.Environment,
			"access_key":              material.AccessKey,
			"protocolo":               material.Protocol,
			"cnpj":                    material.CNPJ,
			"uf":                      material.UF,
			"justificativa":           justificativa,
			"n_seq_evento":            1,
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

// RequestCCe enqueues fiscal.document.cce_requested.v1 for outbound NF-e.
func (s *Service) RequestCCe(
	ctx context.Context,
	organizationID, documentID uuid.UUID,
	in CCeInput,
	actorType, actorID string,
) (*Document, error) {
	correcao := strings.TrimSpace(in.Correcao)
	if len([]rune(correcao)) < 15 {
		return nil, domainerr.Validation("correcao_too_short", "correcao must be at least 15 characters")
	}
	nSeq := in.NSeqEvento
	if nSeq <= 0 {
		nSeq = 1
	}
	if nSeq > 20 {
		return nil, domainerr.Validation("invalid_n_seq_evento", "n_seq_evento must be between 1 and 20")
	}

	doc, err := s.requireOutboundAuthorizedNFe(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	// CC-e also allowed when already correction_registered
	if !strings.EqualFold(doc.Status, StatusAuthorized) && !strings.EqualFold(doc.Status, StatusCorrectionRegistered) {
		return nil, domainerr.Conflict("document_not_correctable", "Only authorized NF-e documents can receive a CC-e")
	}
	material, err := s.loadNFeEventMaterial(ctx, organizationID, documentID, doc)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			update organization_documents
			set processing_status = $3, updated_at = $4, version = version + 1
			where organization_id = $1 and id = $2
		`, organizationID, documentID, ProcessingWaiting, now)
		if err != nil {
			return err
		}

		meta, _ := json.Marshal(map[string]any{
			"correcao":     correcao,
			"n_seq_evento": nSeq,
			"access_key":   material.AccessKey,
		})
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, messaging.EventDocumentCCeRequested, doc.Status, doc.Status,
			actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}

		outbox := map[string]any{
			"document_id":             documentID,
			"organization_company_id": doc.OrganizationCompanyID,
			"document_type":           "nfe",
			"environment":             doc.Environment,
			"access_key":              material.AccessKey,
			"cnpj":                    material.CNPJ,
			"uf":                      material.UF,
			"correcao":                correcao,
			"n_seq_evento":            nSeq,
		}
		if objectKey, keyErr := s.OriginalPayloadObjectKey(ctx, documentID); keyErr == nil && objectKey != "" {
			outbox["payload_object_key"] = objectKey
		}
		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, messaging.EventDocumentCCeRequested, outbox)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetDocument(ctx, organizationID, documentID)
}

// RequestInutilization enqueues fiscal.document.inutilization_requested.v1.
func (s *Service) RequestInutilization(
	ctx context.Context,
	organizationID uuid.UUID,
	in InutilizationInput,
	actorType, actorID string,
) error {
	justificativa := strings.TrimSpace(in.Justificativa)
	if len([]rune(justificativa)) < 15 {
		return domainerr.Validation("justificativa_too_short", "justificativa must be at least 15 characters")
	}
	if in.NumeroInicial <= 0 || in.NumeroFinal < in.NumeroInicial {
		return domainerr.Validation("invalid_number_range", "numero_inicial/numero_final are invalid")
	}
	if in.Ano < 2000 || in.Ano > 2100 {
		return domainerr.Validation("invalid_ano", "ano must be a 4-digit year")
	}
	company, err := s.orgs.GetCompany(ctx, organizationID, in.OrganizationCompanyID)
	if err != nil {
		return err
	}
	uf := ""
	if company.UF != nil {
		uf = strings.ToUpper(strings.TrimSpace(*company.UF))
	}
	if uf == "" {
		return domainerr.Validation("missing_company_uf", "Company UF is required for inutilization")
	}
	cnpj := digitsOnly(company.CNPJ)
	env := "homologacao"
	if strings.TrimSpace(company.Environment) != "" {
		env = strings.TrimSpace(company.Environment)
	}

	aggregateID := in.OrganizationCompanyID
	if in.DocumentID != nil {
		aggregateID = *in.DocumentID
	}
	now := time.Now().UTC()
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		outbox := map[string]any{
			"organization_company_id": in.OrganizationCompanyID,
			"document_type":           "nfe",
			"environment":             env,
			"cnpj":                    cnpj,
			"uf":                      uf,
			"serie":                   strings.TrimSpace(in.Serie),
			"numero_inicial":          in.NumeroInicial,
			"numero_final":            in.NumeroFinal,
			"ano":                     in.Ano,
			"justificativa":           justificativa,
		}
		if in.DocumentID != nil {
			outbox["document_id"] = *in.DocumentID
		}
		meta, _ := json.Marshal(outbox)
		if in.DocumentID != nil {
			_, _ = tx.Exec(ctx, `
				insert into organization_document_events (
					id, organization_id, organization_document_id, event_type, from_status, to_status,
					actor_type, actor_id, metadata_json, occurred_at
				) values ($1,$2,$3,$4,null,null,$5,$6,$7,$8)
			`, ids.New(), organizationID, *in.DocumentID, messaging.EventDocumentInutilizationRequested,
				actorType, nullEmpty(actorID), meta, now)
		}
		_, err := messaging.InsertOutbox(ctx, tx, organizationID, "organization_companies", aggregateID, messaging.EventDocumentInutilizationRequested, outbox)
		return err
	})
}

// RequestProtocol enqueues a ConsultaProtocolo fetch for an outbound NF-e.
func (s *Service) RequestProtocol(
	ctx context.Context,
	organizationID, documentID uuid.UUID,
	actorType, actorID string,
) (*Document, error) {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(doc.DocumentType, "nfe") || !strings.EqualFold(doc.Direction, "outbound") {
		return nil, domainerr.Validation("not_outbound_nfe", "Protocol request is only available for outbound NF-e")
	}
	material, err := s.loadNFeEventMaterial(ctx, organizationID, documentID, doc)
	if err != nil {
		return nil, err
	}
	if material.AccessKey == "" {
		return nil, domainerr.Validation("missing_access_key", "Access key is required to request protocol")
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		meta, _ := json.Marshal(map[string]any{"access_key": material.AccessKey})
		_, err := tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, messaging.EventDocumentProtocolRequested, doc.Status, doc.Status,
			actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}
		outbox := map[string]any{
			"document_id":             documentID,
			"organization_company_id": doc.OrganizationCompanyID,
			"document_type":           "nfe",
			"environment":             doc.Environment,
			"access_key":              material.AccessKey,
			"cnpj":                    material.CNPJ,
			"uf":                      material.UF,
		}
		if objectKey, keyErr := s.OriginalPayloadObjectKey(ctx, documentID); keyErr == nil && objectKey != "" {
			outbox["payload_object_key"] = objectKey
		}
		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, messaging.EventDocumentProtocolRequested, outbox)
		return err
	})
	if err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *Service) requireOutboundAuthorizedNFe(ctx context.Context, organizationID, documentID uuid.UUID) (*Document, error) {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(doc.DocumentType, "nfe") {
		return nil, domainerr.Validation("not_nfe", "Only NF-e documents are supported")
	}
	if !strings.EqualFold(doc.Direction, "outbound") {
		return nil, domainerr.Validation("not_outbound", "Only outbound NF-e can be cancelled/corrected by the issuer")
	}
	st := strings.ToLower(doc.Status)
	if st != StatusAuthorized && st != StatusCorrectionRegistered {
		return nil, domainerr.Conflict("document_not_cancellable", "Only authorized NF-e documents can be cancelled")
	}
	return doc, nil
}

func (s *Service) loadNFeEventMaterial(ctx context.Context, organizationID, documentID uuid.UUID, doc *Document) (nfeEventMaterial, error) {
	var accessKey, protocol *string
	err := s.pool.QueryRow(ctx, `
		select nullif(trim(access_key), ''), nullif(trim(authorization_protocol), '')
		from organization_nfe
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID).Scan(&accessKey, &protocol)
	if err == pgx.ErrNoRows {
		return nfeEventMaterial{}, domainerr.NotFound("nfe_extension_not_found", "NF-e extension row not found")
	}
	if err != nil {
		return nfeEventMaterial{}, err
	}
	out := nfeEventMaterial{}
	if accessKey != nil {
		out.AccessKey = normalizeAccessKey(*accessKey)
	}
	if protocol != nil {
		out.Protocol = strings.TrimSpace(*protocol)
	}
	company, companyErr := s.orgs.GetCompany(ctx, organizationID, doc.OrganizationCompanyID)
	if companyErr != nil {
		return nfeEventMaterial{}, companyErr
	}
	out.CNPJ = digitsOnly(company.CNPJ)
	if company.UF != nil {
		out.UF = strings.ToUpper(strings.TrimSpace(*company.UF))
	}
	if out.UF == "" {
		return nfeEventMaterial{}, domainerr.Validation("missing_company_uf", "Company UF is required")
	}
	if len(out.CNPJ) != 14 {
		return nfeEventMaterial{}, domainerr.Validation("missing_issuer_cnpj", "Issuer CNPJ is required")
	}
	return out, nil
}
