package fiscal

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type Worker struct {
	pool     *db.Pool
	docs     *Service
	provider Provider
}

func NewWorker(pool *db.Pool, docs *Service, provider Provider) *Worker {
	return &Worker{pool: pool, docs: docs, provider: provider}
}

func (w *Worker) ProcessBatch(ctx context.Context, limit int) (int, error) {
	docs, err := w.docs.ClaimQueuedDocuments(ctx, limit)
	if err != nil {
		return 0, err
	}
	for _, doc := range docs {
		if err := w.processOne(ctx, doc); err != nil {
			return 0, err
		}
	}
	return len(docs), nil
}

func (w *Worker) processOne(ctx context.Context, doc Document) error {
	started := time.Now().UTC()
	result, err := w.provider.Transmit(ctx, doc)
	finished := time.Now().UTC()
	if err != nil {
		w.recordAttempt(ctx, doc, 1, result, started, finished, "error", err.Error())
		return w.docs.UpdateStatus(ctx, doc.OrganizationID, doc.ID, doc.Status, StatusFailed, ProcessingFailed, "worker", "fiscal_worker", messaging.EventDocumentStatusChanged, map[string]any{
			"error": err.Error(),
		})
	}

	outcome := result.Outcome
	w.recordAttempt(ctx, doc, 1, result, started, finished, outcome, result.ErrorMessage)

	status, processing, ok := NextStatusesFromProvider(outcome)
	if !ok {
		status, processing = StatusSubmitted, ProcessingWaiting
	}
	eventType := EventTypeForOutcome(outcome)

	meta := map[string]any{}
	if outcome == "rejected" {
		meta["error_code"] = result.ErrorCode
	} else if result.Protocol != "" {
		meta["protocol"] = result.Protocol
	}

	return w.docs.UpdateStatus(ctx, doc.OrganizationID, doc.ID, doc.Status, status, processing, "provider", result.Provider, eventType, meta)
}

// TransmissionResult is the payload shape nfe-gateway publishes on
// fiscal.document.transmission_result.v1 — see
// docs/architecture/22_nfe_gateway_service.md, "Fluxo outbound".
type TransmissionResult struct {
	DocumentID        uuid.UUID `json:"document_id"`
	Outcome           string    `json:"outcome"`
	Protocol          string    `json:"protocol"`
	AccessKey         string    `json:"access_key"`
	CStat             string    `json:"cstat"`
	XMotivo           string    `json:"x_motivo"`
	ErrorCode         string    `json:"error_code"`
	ErrorMessage      string    `json:"error_message"`
	RequestObjectKey  string    `json:"request_object_key"`
	ResponseObjectKey string    `json:"response_object_key"`
	Receipt           string    `json:"receipt"`
	TpEmis            int       `json:"tp_emis"`
	Number            string    `json:"number"`            // NFS-e number (SEFIN)
	VerificationCode  string    `json:"verification_code"` // NFS-e codigo verificacao
}

// EventResult is the payload shape nfe-gateway publishes on
// fiscal.document.event_result.v1 (cancel / CC-e / inutilização).
type EventResult struct {
	DocumentID        *uuid.UUID `json:"document_id"`
	EventKind         string     `json:"event_kind"`
	Outcome           string     `json:"outcome"`
	Protocol          string     `json:"protocol"`
	CStat             string     `json:"cstat"`
	XMotivo           string     `json:"x_motivo"`
	ErrorMessage      string     `json:"error_message"`
	RequestObjectKey  string     `json:"request_object_key"`
	ResponseObjectKey string     `json:"response_object_key"`
}

// ParseTransmissionResult decodes the CloudEvents envelope and inner data —
// kept pure/side-effect-free so the parsing itself is unit-testable without
// a broker or database.
func ParseTransmissionResult(payload []byte) (organizationID uuid.UUID, result TransmissionResult, err error) {
	var envelope messaging.CloudEvent
	if err = json.Unmarshal(payload, &envelope); err != nil {
		return uuid.Nil, TransmissionResult{}, err
	}
	if err = json.Unmarshal(envelope.Data, &result); err != nil {
		return uuid.Nil, TransmissionResult{}, err
	}
	return envelope.OrganizationID, result, nil
}

func ParseEventResult(payload []byte) (organizationID uuid.UUID, result EventResult, err error) {
	var envelope messaging.CloudEvent
	if err = json.Unmarshal(payload, &envelope); err != nil {
		return uuid.Nil, EventResult{}, err
	}
	if err = json.Unmarshal(envelope.Data, &result); err != nil {
		return uuid.Nil, EventResult{}, err
	}
	return envelope.OrganizationID, result, nil
}

// IsStaleStatusConflict reports whether err is the optimistic-lock conflict
// UpdateStatus returns when the document already moved past fromStatus —
// expected on an at-least-once redelivery of a result already applied, not
// a real failure (see 08_messaging_and_workers.md: "processamento
// idempotente").
func IsStaleStatusConflict(err error) bool {
	var de *domainerr.Error
	return errors.As(err, &de) && de.Code == "stale_document_status"
}

// HandleTransmissionResult applies the outcome nfe-gateway reports for a
// document previously handed off via MessagingProvider.Transmit — the async
// counterpart to processOne's synchronous StubProvider path. Records a
// second attempt (attempt 1 was "submitted to gateway", recorded by
// processOne) and reuses the exact same status-machine helpers processOne
// uses, so a document authorized synchronously (StubProvider) and one
// authorized asynchronously (nfe-gateway) end up in identical states.
func (w *Worker) HandleTransmissionResult(ctx context.Context, payload []byte) error {
	organizationID, result, err := ParseTransmissionResult(payload)
	if err != nil {
		return err
	}

	doc, err := w.docs.GetDocument(ctx, organizationID, result.DocumentID)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	w.recordAttempt(ctx, *doc, 2, ProviderResult{
		Outcome:      result.Outcome,
		Provider:     "nfe_gateway",
		ErrorCode:    result.ErrorCode,
		ErrorMessage: result.ErrorMessage,
		Protocol:     result.Protocol,
	}, now, now, result.Outcome, result.ErrorMessage)

	status, processing, ok := NextStatusesFromProvider(result.Outcome)
	if !ok {
		status, processing = StatusFailed, ProcessingFailed
	}

	if err := w.docs.ApplyTransmissionResult(ctx, *doc, status, processing, result); err != nil {
		if IsStaleStatusConflict(err) {
			return nil
		}
		return err
	}
	return nil
}

// HandleEventResult applies cancel / CC-e / inutilização outcomes from nfe-gateway.
func (w *Worker) HandleEventResult(ctx context.Context, payload []byte) error {
	organizationID, result, err := ParseEventResult(payload)
	if err != nil {
		return err
	}
	if result.DocumentID == nil {
		return nil
	}
	doc, err := w.docs.GetDocument(ctx, organizationID, *result.DocumentID)
	if err != nil {
		return err
	}
	status, processing, ok := NextStatusesFromEventResult(result.EventKind, result.Outcome)
	if !ok {
		status, processing = StatusFailed, ProcessingFailed
	}
	eventType := EventTypeForOutcome(result.Outcome)
	if result.Outcome == "accepted" {
		switch result.EventKind {
		case "cancel":
			eventType = EventTypeForOutcome("cancelled")
		case "cce":
			eventType = EventTypeForOutcome("correction_registered")
		case "inutilization":
			eventType = EventTypeForOutcome("inutilized")
		}
	} else if result.EventKind == "cancel" && status == StatusAuthorized {
		eventType = messaging.EventDocumentStatusChanged
	}
	meta := map[string]any{
		"event_kind": result.EventKind,
		"cstat":      result.CStat,
		"x_motivo":   result.XMotivo,
		"protocol":   result.Protocol,
	}
	if result.RequestObjectKey != "" {
		meta["request_object_key"] = result.RequestObjectKey
	}
	if result.ResponseObjectKey != "" {
		meta["response_object_key"] = result.ResponseObjectKey
	}
	if err := w.docs.UpdateStatus(ctx, doc.OrganizationID, doc.ID, doc.Status, status, processing, "nfe_gateway", "nfe_gateway", eventType, meta); err != nil {
		if IsStaleStatusConflict(err) {
			return nil
		}
		return err
	}
	if result.EventKind == "cancel" || result.EventKind == "cce" {
		_ = w.docs.RegisterCancelPayloads(ctx, doc.OrganizationID, doc.ID, result.RequestObjectKey, result.ResponseObjectKey)
	}
	return nil
}

func (w *Worker) recordAttempt(ctx context.Context, doc Document, attempt int, result ProviderResult, started, finished time.Time, outcome, errMsg string) {
	provider := result.Provider
	if provider == "" {
		provider = "stub_sefaz"
	}
	var httpStatus any
	if result.HTTPStatus != 0 {
		httpStatus = result.HTTPStatus
	}
	var errCode any
	if result.ErrorCode != "" {
		errCode = result.ErrorCode
	}
	var errMessage any
	if errMsg != "" {
		errMessage = errMsg
	}
	_, _ = w.pool.Exec(ctx, `
		insert into organization_document_attempts (
			id, organization_id, organization_document_id, attempt_number, provider, operation,
			started_at, finished_at, outcome, http_status, error_code, error_message_sanitized, created_at
		) values ($1,$2,$3,$4,$5,'transmit',$6,$7,$8,$9,$10,$11,now())
		on conflict (organization_document_id, attempt_number) do nothing
	`, ids.New(), doc.OrganizationID, doc.ID, attempt, provider, started, finished, outcome, httpStatus, errCode, errMessage)
}
