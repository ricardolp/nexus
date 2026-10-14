package fiscal

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

var errStatusConsultIdempotencyRace = errors.New("status consult idempotency race")

const (
	nfeAccessKeyLen                = 44
	statusConsultIdempotencyPrefix = "sefaz_status_consult:"
)

// GetDocumentByRefInput resolves GET /v1/fiscal_documents/{ref} where ref is
// either a document UUID or an NF-e access key (chave).
type GetDocumentByRefInput struct {
	OrganizationID uuid.UUID
	Ref            string
	SourceSystem   string
	ActorType      string
	ActorID        string
	CorrelationID  uuid.UUID
	TraceID        uuid.UUID
}

type nfeAccessKeyParts struct {
	IssuerCNPJ string
	Model      string
	Series     string
	Number     string
}

// LooksLikeNFeAccessKey reports whether ref is a 44-digit NF-e access key
// (as opposed to a document UUID).
func LooksLikeNFeAccessKey(ref string) bool {
	key := normalizeAccessKey(ref)
	if len(key) != nfeAccessKeyLen {
		return false
	}
	for _, r := range key {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseNFeAccessKey(key string) (nfeAccessKeyParts, error) {
	key = normalizeAccessKey(key)
	if len(key) != nfeAccessKeyLen {
		return nfeAccessKeyParts{}, domainerr.Validation("invalid_access_key", "NF-e access key must have 44 digits")
	}
	for _, r := range key {
		if r < '0' || r > '9' {
			return nfeAccessKeyParts{}, domainerr.Validation("invalid_access_key", "NF-e access key must be numeric")
		}
	}
	series := strings.TrimLeft(key[22:25], "0")
	if series == "" {
		series = "0"
	}
	number := strings.TrimLeft(key[25:34], "0")
	if number == "" {
		number = "0"
	}
	return nfeAccessKeyParts{
		IssuerCNPJ: key[6:20],
		Model:      key[20:22],
		Series:     series,
		Number:     number,
	}, nil
}

func statusConsultIdempotencyKey(accessKey string) string {
	return statusConsultIdempotencyPrefix + normalizeAccessKey(accessKey)
}

func IsStatusConsultDocument(idempotencyKey string) bool {
	return strings.HasPrefix(idempotencyKey, statusConsultIdempotencyPrefix)
}

// GetDocumentByRef returns a document by UUID or NF-e access key. When the
// key is unknown, it creates an outbound stub in submitted/waiting_external
// (so SAP can keep polling unchanged) and enqueues ConsultaProtocolo.
func (s *Service) GetDocumentByRef(ctx context.Context, in GetDocumentByRefInput) (*Document, error) {
	ref := strings.TrimSpace(in.Ref)
	if ref == "" {
		return nil, domainerr.Validation("invalid_document_id", "document_id is required")
	}
	if id, err := uuid.Parse(ref); err == nil {
		return s.GetDocument(ctx, in.OrganizationID, id)
	}
	if !LooksLikeNFeAccessKey(ref) {
		return nil, domainerr.Validation("invalid_document_id", "Invalid document_id or access key")
	}
	return s.getOrEnqueueStatusConsult(ctx, in, normalizeAccessKey(ref))
}

func (s *Service) getOrEnqueueStatusConsult(ctx context.Context, in GetDocumentByRefInput, accessKey string) (*Document, error) {
	if doc, err := s.FindOutboundNFeByAccessKey(ctx, in.OrganizationID, accessKey); err != nil {
		return nil, err
	} else if doc != nil {
		if err := s.ensureStatusConsultQueued(ctx, in, doc); err != nil {
			return nil, err
		}
		return doc, nil
	}
	if doc, err := s.FindInboundNFeByAccessKey(ctx, in.OrganizationID, accessKey); err != nil {
		return nil, err
	} else if doc != nil {
		return doc, nil
	}

	doc, created, err := s.ensureStatusConsultStub(ctx, in, accessKey)
	if err != nil {
		return nil, err
	}
	if created || IsStatusConsultDocument(doc.IdempotencyKey) {
		if err := s.ensureStatusConsultQueued(ctx, in, doc); err != nil {
			return nil, err
		}
		return s.GetDocument(ctx, in.OrganizationID, doc.ID)
	}
	return doc, nil
}

func (s *Service) ensureStatusConsultQueued(ctx context.Context, in GetDocumentByRefInput, doc *Document) error {
	if doc == nil || !IsStatusConsultDocument(doc.IdempotencyKey) {
		return nil
	}
	if doc.Status != StatusSubmitted || doc.ProcessingStatus != ProcessingWaiting {
		return nil
	}
	queued, err := s.hasProtocolRequestEvent(ctx, doc.OrganizationID, doc.ID)
	if err != nil {
		return err
	}
	if queued {
		return nil
	}
	_, err = s.RequestProtocol(ctx, in.OrganizationID, doc.ID, in.ActorType, in.ActorID)
	return err
}

func (s *Service) hasProtocolRequestEvent(ctx context.Context, organizationID, documentID uuid.UUID) (bool, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		select count(*)::int
		from organization_document_events
		where organization_id = $1
		  and organization_document_id = $2
		  and event_type = $3
	`, organizationID, documentID, messaging.EventDocumentProtocolRequested).Scan(&n)
	return n > 0, err
}

func (s *Service) ensureStatusConsultStub(ctx context.Context, in GetDocumentByRefInput, accessKey string) (*Document, bool, error) {
	parts, err := parseNFeAccessKey(accessKey)
	if err != nil {
		return nil, false, err
	}
	company, err := s.orgs.GetCompanyByCNPJ(ctx, in.OrganizationID, parts.IssuerCNPJ)
	if err != nil {
		return nil, false, err
	}
	serviceCode := ServiceCodeFor("nfe", "outbound")
	ok, err := s.orgs.HasCompanyService(ctx, in.OrganizationID, company.ID, serviceCode)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, domainerr.Validation("document_service_disabled", "The requested fiscal service is not enabled for this company.")
	}

	sourceSystem := strings.TrimSpace(in.SourceSystem)
	if sourceSystem == "" {
		sourceSystem = "api_client"
	}
	idempotencyKey := statusConsultIdempotencyKey(accessKey)
	if existing, err := s.findByIdempotency(ctx, in.OrganizationID, company.ID, sourceSystem, idempotencyKey); err != nil {
		return nil, false, err
	} else if existing != nil {
		return existing, false, nil
	}

	now := time.Now().UTC()
	correlationID := in.CorrelationID
	if correlationID == uuid.Nil {
		correlationID = ids.New()
	}
	traceID := in.TraceID
	if traceID == uuid.Nil {
		traceID = ids.New()
	}
	docKey := accessKey
	doc := &Document{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: company.ID,
		DocumentType:          "nfe",
		Direction:             "outbound",
		Environment:           company.Environment,
		SourceSystem:          sourceSystem,
		IdempotencyKey:        idempotencyKey,
		DocumentKey:           &docKey,
		Status:                StatusSubmitted,
		ProcessingStatus:      ProcessingWaiting,
		CurrentVersion:        1,
		CorrelationID:         correlationID,
		TraceID:               traceID,
		ReceivedAt:            now,
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_documents (
				id, organization_id, organization_company_id, document_type, direction, environment,
				external_id, source_system, source_document_id, idempotency_key, document_key,
				status, processing_status, current_version, correlation_id, trace_id,
				received_at, created_at, updated_at
			) values (
				$1,$2,$3,$4,$5,$6,null,$7,null,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
			)
		`,
			doc.ID, doc.OrganizationID, doc.OrganizationCompanyID, doc.DocumentType, doc.Direction, doc.Environment,
			doc.SourceSystem, doc.IdempotencyKey, doc.DocumentKey,
			doc.Status, doc.ProcessingStatus, doc.CurrentVersion, doc.CorrelationID, doc.TraceID,
			doc.ReceivedAt, doc.CreatedAt, doc.UpdatedAt,
		)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				return errStatusConsultIdempotencyRace
			}
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into organization_nfe (
				organization_document_id, organization_id, access_key, series, number, model,
				issuer_cnpj, recipient_document, issued_at, metadata_json
			) values ($1,$2,$3,$4,$5,$6,$7,null,null,'{}'::jsonb)
		`, doc.ID, in.OrganizationID, accessKey, parts.Series, parts.Number, parts.Model, parts.IssuerCNPJ)
		if err != nil {
			return err
		}
		meta := mustJSON(map[string]any{
			"source":     "status_consult_by_access_key",
			"access_key": accessKey,
		})
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,null,$5,$6,$7,$8,$9)
		`, ids.New(), in.OrganizationID, doc.ID, messaging.EventDocumentReceived, doc.Status,
			nullEmpty(in.ActorType), nullEmpty(in.ActorID), meta, now)
		return err
	})
	if err != nil {
		if errors.Is(err, errStatusConsultIdempotencyRace) || (strings.Contains(err.Error(), "unique")) {
			existing, findErr := s.findByIdempotency(ctx, in.OrganizationID, company.ID, sourceSystem, idempotencyKey)
			if findErr != nil {
				return nil, false, findErr
			}
			if existing != nil {
				return existing, false, nil
			}
			if existing, findErr = s.FindOutboundNFeByAccessKey(ctx, in.OrganizationID, accessKey); findErr != nil {
				return nil, false, findErr
			}
			if existing != nil {
				return existing, false, nil
			}
			return nil, false, domainerr.Conflict("idempotency_key_reuse", "Status consult already in progress")
		}
		return nil, false, err
	}
	return doc, true, nil
}

// statusesFromProtocolConsult maps ConsultaProtocolo outcome/cStat onto the
// same status vocabulary SAP already polls after a normal emission.
func statusesFromProtocolConsult(result ProtocolConsultResult) (status, processing, eventType string, ok bool) {
	cstat := strings.TrimSpace(result.CStat)
	switch strings.ToLower(strings.TrimSpace(result.Outcome)) {
	case "error":
		return StatusFailed, ProcessingFailed, EventTypeForOutcome("error"), true
	case "not_found":
		return StatusFailed, ProcessingFailed, EventTypeForOutcome("error"), true
	case "ok":
		switch cstat {
		case "100", "150":
			return StatusAuthorized, ProcessingCompleted, EventTypeForOutcome("authorized"), true
		case "101":
			return StatusCancelled, ProcessingCompleted, EventTypeForOutcome("cancelled"), true
		case "":
			// Gateway marks outcome=ok when protNFe is present even without a
			// clear authorized cStat — treat as authorized for status consult.
			return StatusAuthorized, ProcessingCompleted, EventTypeForOutcome("authorized"), true
		default:
			return StatusRejected, ProcessingCompleted, EventTypeForOutcome("rejected"), true
		}
	default:
		return "", "", "", false
	}
}
