package fiscal

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

const (
	OutboundResendResubmit          = "resubmit"
	OutboundResendAlreadyAuthorized = "already_authorized"
	OutboundResendInProcessing      = "in_processing"
	OutboundResendFinalized         = "finalized"

	naturalKeyUniqueIndex = "uq_organization_documents_outbound_natural_key"
)

var (
	errNaturalKeyRace          = errors.New("outbound natural key race")
	errResendAlreadyAuthorized = errors.New("outbound resend already authorized")
)

// OutboundNFeNaturalKey identifies an outbound NF-e by model, series and
// number (leading zeros ignored), so SAP resends map to the same document.
// Returns "" when the number is missing.
func OutboundNFeNaturalKey(series, number string) string {
	s, n := normalizeOutboundSeriesNumber(series, number)
	if n == "" {
		return ""
	}
	return "nfe:55:" + s + ":" + n
}

// OutboundNFSeNaturalKey identifies an outbound NFS-e by RPS series and
// number (leading zeros ignored), so SAP resends map to the same document.
// Returns "" when the number is missing.
func OutboundNFSeNaturalKey(series, number string) string {
	s, n := normalizeOutboundSeriesNumber(series, number)
	if n == "" {
		return ""
	}
	return "nfse:" + s + ":" + n
}

func normalizeOutboundSeriesNumber(series, number string) (string, string) {
	n := strings.TrimLeft(strings.TrimSpace(number), "0")
	if n == "" {
		return "", ""
	}
	s := strings.TrimLeft(strings.TrimSpace(series), "0")
	if s == "" {
		s = "0"
	}
	return s, n
}

func outboundDocumentLabel(documentType string) string {
	if strings.EqualFold(strings.TrimSpace(documentType), "nfse") {
		return "NFS-e"
	}
	return "NF-e"
}

// DecideOutboundResubmission tells what to do when an outbound NF-e or NFS-e
// that already exists is received again.
func DecideOutboundResubmission(status, processingStatus string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case StatusAuthorized, StatusCorrectionRegistered, StatusCancelRequested:
		return OutboundResendAlreadyAuthorized
	case StatusCancelled, StatusInutilized:
		return OutboundResendFinalized
	case StatusRejected, StatusFailed:
		return OutboundResendResubmit
	}
	if strings.EqualFold(strings.TrimSpace(processingStatus), ProcessingFailed) {
		return OutboundResendResubmit
	}
	return OutboundResendInProcessing
}

type outboundResend struct {
	in             ReceiveInput
	sapPayload     *SAPNFePayload
	sapNFSePayload *SAPNFSePayload
	nfe            *NFeExtension
	payload        []byte
	contentType    string
	requestHash    string
	companyUF      *string
}

func resendConflict(action, status, documentType string) error {
	label := outboundDocumentLabel(documentType)
	if action == OutboundResendFinalized {
		return domainerr.Conflict("document_finalized", fmt.Sprintf("%s já finalizada (status %s)", label, status))
	}
	return domainerr.Conflict("document_in_processing", fmt.Sprintf("%s já está em processamento (status %s)", label, status))
}

func (s *Service) handleOutboundResend(ctx context.Context, existing *Document, r outboundResend) (*ReceiveResult, error) {
	action := DecideOutboundResubmission(existing.Status, existing.ProcessingStatus)
	switch action {
	case OutboundResendAlreadyAuthorized:
		return s.alreadyAuthorizedResult(ctx, existing)
	case OutboundResendResubmit:
	default:
		return nil, resendConflict(action, existing.Status, existing.DocumentType)
	}
	doc, err := s.resubmitOutboundNFe(ctx, existing, r)
	if errors.Is(err, errResendAlreadyAuthorized) {
		current, getErr := s.GetDocument(ctx, existing.OrganizationID, existing.ID)
		if getErr != nil {
			return nil, getErr
		}
		return s.alreadyAuthorizedResult(ctx, current)
	}
	if err != nil {
		return nil, err
	}
	return &ReceiveResult{Document: doc, Resubmitted: true}, nil
}

func (s *Service) alreadyAuthorizedResult(ctx context.Context, doc *Document) (*ReceiveResult, error) {
	res := &ReceiveResult{Document: doc, AlreadyAuthorized: true}
	if strings.EqualFold(doc.DocumentType, "nfse") {
		consult, err := s.NFSeConsult(ctx, doc)
		if err != nil {
			return nil, err
		}
		res.AccessKey = consult.AccessKey
		res.Protocol = consult.Protocol
		res.Number = consult.Numero
		res.RPSNumber = consult.NumeroRPS
		res.Series = consult.Serie
		return res, nil
	}
	var accessKey, protocol *string
	err := s.pool.QueryRow(ctx, `
		select access_key, authorization_protocol
		from organization_nfe
		where organization_id = $1 and organization_document_id = $2
	`, doc.OrganizationID, doc.ID).Scan(&accessKey, &protocol)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if accessKey != nil {
		res.AccessKey = strings.TrimSpace(*accessKey)
	}
	if protocol != nil {
		res.Protocol = strings.TrimSpace(*protocol)
	}
	return res, nil
}

func (s *Service) findByNaturalKey(ctx context.Context, organizationID, companyID uuid.UUID, environment, naturalKey string) (*Document, error) {
	doc, err := s.scanDocument(ctx, `
		select id, organization_id, organization_company_id, document_type, direction, environment,
		       external_id, source_system, source_document_id, idempotency_key, document_key,
		       status, processing_status, current_version, correlation_id, trace_id,
		       received_at, completed_at, created_at, updated_at
		from organization_documents
		where organization_id = $1 and organization_company_id = $2 and environment = $3 and natural_key = $4
	`, organizationID, companyID, environment, naturalKey)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "document_not_found" {
			return nil, nil
		}
		return nil, err
	}
	return doc, nil
}

// resubmitOutboundNFe replaces the payload of a rejected/failed outbound
// NF-e or NFS-e with the one just received and puts it back on the
// transmission queue. Previous payloads stay registered for history.
func (s *Service) resubmitOutboundNFe(ctx context.Context, existing *Document, r outboundResend) (*Document, error) {
	orgID, docID := existing.OrganizationID, existing.ID
	objectKey := storage.ObjectKey(s.prefix, orgID.String(), docID.String(), "original_request",
		fmt.Sprintf("payload.v%d.bin", existing.CurrentVersion+1))
	if err := s.store.Put(ctx, objectKey, r.contentType, r.payload); err != nil {
		return nil, err
	}

	idempotencyKey := strings.TrimSpace(r.in.IdempotencyKey)
	if idempotencyKey == "" {
		idempotencyKey = existing.IdempotencyKey
	}
	correlationID := r.in.CorrelationID
	if correlationID == uuid.Nil {
		correlationID = existing.CorrelationID
	}
	traceID := r.in.TraceID
	if traceID == uuid.Nil {
		traceID = existing.TraceID
	}
	now := time.Now().UTC()

	err := s.pool.WithTenant(ctx, orgID, func(ctx context.Context, tx pgx.Tx) error {
		var status, processing string
		var currentVersion int
		if err := tx.QueryRow(ctx, `
			select status, processing_status, current_version
			from organization_documents
			where organization_id = $1 and id = $2
			for update
		`, orgID, docID).Scan(&status, &processing, &currentVersion); err != nil {
			return err
		}
		switch action := DecideOutboundResubmission(status, processing); action {
		case OutboundResendResubmit:
		case OutboundResendAlreadyAuthorized:
			return errResendAlreadyAuthorized
		default:
			return resendConflict(action, status, existing.DocumentType)
		}
		newVersion := currentVersion + 1

		var prevCStat, prevXMotivo *string
		if strings.EqualFold(existing.DocumentType, "nfse") {
			if err := tx.QueryRow(ctx, `
				select authorization_code, authorization_message
				from organization_nfse
				where organization_id = $1 and organization_document_id = $2
			`, orgID, docID).Scan(&prevCStat, &prevXMotivo); err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		} else if err := tx.QueryRow(ctx, `
			select authorization_cstat, authorization_xmotivo
			from organization_nfe
			where organization_id = $1 and organization_document_id = $2
		`, orgID, docID).Scan(&prevCStat, &prevXMotivo); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		if _, err := tx.Exec(ctx, `
			insert into organization_document_payloads (
				id, organization_id, organization_document_id, payload_type, content_type,
				storage_object_key, sha256, size_bytes, contains_sensitive_data, created_at
			) values ($1,$2,$3,'original_request',$4,$5,$6,$7,true,$8)
		`, ids.New(), orgID, docID, r.contentType, objectKey, r.requestHash, len(r.payload), now); err != nil {
			return err
		}

		if strings.EqualFold(existing.DocumentType, "nfse") {
			if _, err := tx.Exec(ctx, `
				update organization_nfse set
					access_key = null,
					dps_id = null,
					nfse_number = null,
					verification_code = null,
					authorization_status = null,
					authorization_code = null,
					authorization_message = null,
					authorized_at = null
				where organization_id = $1 and organization_document_id = $2
			`, orgID, docID); err != nil {
				return err
			}
			if r.sapNFSePayload != nil {
				if err := s.persistOutboundNFSe(ctx, tx, orgID, docID, r.sapNFSePayload); err != nil {
					return err
				}
			}
		} else {
			var accessKey, series, number, issuerCNPJ, recipient string
			var issuedAt *time.Time
			if r.nfe != nil {
				accessKey, series, number = r.nfe.AccessKey, r.nfe.Series, r.nfe.Number
				issuerCNPJ, recipient, issuedAt = r.nfe.IssuerCNPJ, r.nfe.RecipientDocument, r.nfe.IssuedAt
			}
			if _, err := tx.Exec(ctx, `
				update organization_nfe set
					access_key = $3,
					series = coalesce($4, series),
					number = coalesce($5, number),
					issuer_cnpj = coalesce($6, issuer_cnpj),
					recipient_document = coalesce($7, recipient_document),
					issued_at = coalesce($8, issued_at),
					authorization_protocol = null,
					authorization_cstat = null,
					authorization_xmotivo = null,
					authorization_uf = null,
					authorized_at = null,
					authorization_digest_value = null
				where organization_id = $1 and organization_document_id = $2
			`, orgID, docID, nullEmpty(accessKey), nullEmpty(series), nullEmpty(number),
				nullEmpty(issuerCNPJ), nullEmpty(recipient), issuedAt); err != nil {
				return err
			}

			if r.sapPayload != nil {
				if err := deleteOutboundChildren(ctx, tx, orgID, docID); err != nil {
					return err
				}
				if err := s.persistOutboundNFe(ctx, tx, orgID, docID, r.sapPayload, r.companyUF); err != nil {
					return err
				}
			}
		}

		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = null,
			    current_version = $5,
			    idempotency_key = $6,
			    correlation_id = $7,
			    trace_id = $8,
			    updated_at = $9,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $10 and processing_status = $11
		`, orgID, docID, StatusReceived, ProcessingQueued, newVersion, idempotencyKey,
			correlationID, traceID, now, status, processing)
		if err != nil {
			if strings.Contains(err.Error(), "organization_documents") && strings.Contains(err.Error(), "unique") {
				return domainerr.Conflict("idempotency_key_reuse", "Idempotency-Key already used by another document")
			}
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}

		if _, err := tx.Exec(ctx, `
			insert into idempotency_records (
				id, organization_id, scope, idempotency_key, request_hash, status, response_status, response_body, expires_at, created_at
			) values ($1,$2,'fiscal_documents',$3,$4,'completed',202,$5, now() + interval '24 hours', $6)
			on conflict (organization_id, scope, idempotency_key) do update
			set request_hash = excluded.request_hash,
			    response_body = excluded.response_body,
			    expires_at = excluded.expires_at
		`, ids.New(), orgID, idempotencyKey, r.requestHash, mustJSON(map[string]any{
			"document_id": docID,
			"trace_id":    traceID,
			"status":      StatusReceived,
		}), now); err != nil {
			return err
		}

		meta := map[string]any{
			"reason":              "sap_resend",
			"previous_status":     status,
			"previous_processing": processing,
			"payload_version":     newVersion,
			"payload_sha256":      r.requestHash,
		}
		if prevCStat != nil {
			meta["previous_cstat"] = strings.TrimSpace(*prevCStat)
		}
		if prevXMotivo != nil {
			meta["previous_xmotivo"] = strings.TrimSpace(*prevXMotivo)
		}
		if _, err := tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, correlation_id, trace_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		`, ids.New(), orgID, docID, messaging.EventDocumentResubmitted, status, StatusReceived,
			r.in.ActorType, nullEmpty(r.in.ActorID), correlationID, traceID, mustJSON(meta), now); err != nil {
			return err
		}

		_, err = messaging.InsertOutbox(ctx, tx, orgID, "organization_documents", docID, messaging.EventDocumentResubmitted, map[string]any{
			"document_id":     docID,
			"from_status":     status,
			"to_status":       StatusReceived,
			"status":          StatusReceived,
			"reason":          "sap_resend",
			"payload_version": newVersion,
		})
		return err
	})
	if err != nil {
		_ = s.store.Delete(ctx, objectKey)
		return nil, err
	}
	return s.GetDocument(ctx, orgID, docID)
}

// deleteOutboundChildren removes the relational copy of the SAP payload
// (items, volumes and header arrays) so it can be persisted again.
// Item and volume children cascade.
func deleteOutboundChildren(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID) error {
	tables := []string{
		"organization_nfe_items",
		"organization_nfe_volumes",
		"organization_nfe_referenced_docs",
		"organization_nfe_anticipation_keys",
		"organization_nfe_previous_dfe_keys",
		"organization_nfe_authorized_persons",
		"organization_nfe_duplicates",
		"organization_nfe_payments",
		"organization_nfe_trailers",
		"organization_nfe_contributor_notes",
		"organization_nfe_fisco_notes",
		"organization_nfe_referenced_processes",
		"organization_nfe_sugarcane_days",
		"organization_nfe_sugarcane_deductions",
	}
	for _, table := range tables {
		if _, err := tx.Exec(ctx, `delete from `+table+` where organization_id = $1 and organization_document_id = $2`, organizationID, documentID); err != nil {
			return err
		}
	}
	return nil
}

const (
	// StaleOutboundAfter is how long an outbound note may sit in processing
	// before the worker puts it back on the transmission queue.
	StaleOutboundAfter = 10 * time.Minute

	// CalculatorTimeoutRetryAfter is the pause before the next automatic NFS-e
	// send when the IBS/CBS calculator times out or cancels the call.
	CalculatorTimeoutRetryAfter = 2 * time.Minute

	// CalculatorTimeoutMaxRetries is how many of those pauses run before the
	// note is marked failed and waits for a manual resubmit.
	CalculatorTimeoutMaxRetries = 5

	ProcessingCancelledCode    = "processing_cancelled"
	ProcessingCancelledMessage = "Processamento cancelado por um administrador antes do envio à autoridade fiscal."
)

// OutboundSentToAuthority is true once the gateway has stored the signed XML
// or the authority response. waiting_recibo is also "sent": SEFAZ already
// accepted the lote.
func OutboundSentToAuthority(processingStatus string, payloadTypes []string) bool {
	switch strings.ToLower(strings.TrimSpace(processingStatus)) {
	case ProcessingWaitingRecibo:
		return true
	}
	for _, payloadType := range payloadTypes {
		switch strings.ToLower(strings.TrimSpace(payloadType)) {
		case PayloadProviderRequest, PayloadSefazResponse:
			return true
		}
	}
	return false
}

// OutboundProcessingAbortable reports whether an admin may stop the note
// before it reaches SEFAZ/SEFIN.
func OutboundProcessingAbortable(status, processingStatus string, sentToAuthority bool) bool {
	if sentToAuthority {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(status)) {
	case StatusReceived, StatusSubmitted:
	default:
		return false
	}
	switch strings.ToLower(strings.TrimSpace(processingStatus)) {
	case ProcessingPending, ProcessingQueued, ProcessingProcessing, ProcessingRetry, ProcessingWaiting:
		return true
	default:
		return false
	}
}

// StaleOutboundProcessing is an in-flight outbound state the worker should
// requeue after StaleOutboundAfter.
func StaleOutboundProcessing(status, processingStatus string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case StatusReceived, StatusSubmitted, StatusContingencyPending:
	default:
		return false
	}
	switch strings.ToLower(strings.TrimSpace(processingStatus)) {
	case ProcessingProcessing, ProcessingWaiting, ProcessingWaitingRecibo:
		return true
	default:
		return false
	}
}

// RequeueStaleOutbound puts outbound notes that have been processing for
// longer than olderThan back on the transmission queue. The next
// ProcessBatch claims them and runs Transmit again, including the
// certificate check.
func (s *Service) RequeueStaleOutbound(ctx context.Context, olderThan time.Duration, limit int) (int, error) {
	if olderThan <= 0 {
		olderThan = StaleOutboundAfter
	}
	if limit <= 0 {
		limit = 20
	}
	cutoff := time.Now().UTC().Add(-olderThan)
	var requeued int
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id, organization_id, status, processing_status
			from organization_documents
			where direction = 'outbound'
			  and status in ('received', 'submitted', 'contingency_pending')
			  and processing_status in ('processing', 'waiting_external', 'waiting_recibo')
			  and idempotency_key not like 'sefaz_status_consult:%'
			  and updated_at < $1
			order by updated_at
			limit $2
			for update skip locked
		`, cutoff, limit)
		if err != nil {
			return err
		}
		defer rows.Close()

		type staleDoc struct {
			id         uuid.UUID
			orgID      uuid.UUID
			status     string
			processing string
		}
		var docs []staleDoc
		for rows.Next() {
			var d staleDoc
			if err := rows.Scan(&d.id, &d.orgID, &d.status, &d.processing); err != nil {
				return err
			}
			docs = append(docs, d)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		rows.Close()

		now := time.Now().UTC()
		for _, d := range docs {
			if !StaleOutboundProcessing(d.status, d.processing) {
				continue
			}
			tag, err := tx.Exec(ctx, `
				update organization_documents
				set status = $3,
				    processing_status = $4,
				    completed_at = null,
				    updated_at = $5,
				    version = version + 1
				where id = $1 and organization_id = $2
				  and status = $6 and processing_status = $7
			`, d.id, d.orgID, StatusReceived, ProcessingQueued, now, d.status, d.processing)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				continue
			}
			meta := map[string]any{
				"reason":              "stale_processing",
				"previous_status":     d.status,
				"previous_processing": d.processing,
			}
			metaBytes := mustJSON(meta)
			if _, err := tx.Exec(ctx, `
				insert into organization_document_events (
					id, organization_id, organization_document_id, event_type, from_status, to_status,
					actor_type, actor_id, metadata_json, occurred_at
				) values ($1,$2,$3,$4,$5,$6,'system','fiscal_worker',$7,$8)
			`, ids.New(), d.orgID, d.id, messaging.EventDocumentRetryScheduled, d.status, StatusReceived, metaBytes, now); err != nil {
				return err
			}
			if _, err := messaging.InsertOutbox(ctx, tx, d.orgID, "organization_documents", d.id, messaging.EventDocumentRetryScheduled, map[string]any{
				"document_id": d.id,
				"from_status": d.status,
				"to_status":   StatusReceived,
				"status":      StatusReceived,
				"reason":      "stale_processing",
			}); err != nil {
				return err
			}
			requeued++
		}
		return nil
	})
	return requeued, err
}

// AbortOutboundProcessing stops an outbound note that is still processing
// and has not been sent to the authority. The note becomes failed so it can
// be resubmitted later, and the stale-processing sweeper leaves it alone.
func (s *Service) AbortOutboundProcessing(ctx context.Context, organizationID, documentID uuid.UUID, actorType, actorID string) (*Document, error) {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	if strings.ToLower(doc.Direction) != "outbound" {
		return nil, domainerr.Validation("not_outbound", "Only outbound documents can have their processing cancelled")
	}
	payloads, err := s.payloadTypes(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	sent := OutboundSentToAuthority(doc.ProcessingStatus, payloads)
	if !OutboundProcessingAbortable(doc.Status, doc.ProcessingStatus, sent) {
		return nil, domainerr.Conflict("processing_not_abortable", "Só é possível cancelar o processamento de uma nota que ainda não foi enviada à autoridade fiscal")
	}

	now := time.Now().UTC()
	meta := map[string]any{
		"error_code":    ProcessingCancelledCode,
		"cstat":         ProcessingCancelledCode,
		"error_message": ProcessingCancelledMessage,
		"x_motivo":      ProcessingCancelledMessage,
		"reason":        "admin_abort_processing",
	}
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = $5,
			    updated_at = $5,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $6 and processing_status = $7
		`, organizationID, documentID, StatusFailed, ProcessingFailed, now, doc.Status, doc.ProcessingStatus)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}
		if _, err := tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, EventTypeForOutcome("error"), doc.Status, StatusFailed,
			actorType, nullEmpty(actorID), mustJSON(meta), now); err != nil {
			return err
		}
		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, EventTypeForOutcome("error"), map[string]any{
			"document_id":   documentID,
			"from_status":   doc.Status,
			"to_status":     StatusFailed,
			"status":        StatusFailed,
			"error_code":    ProcessingCancelledCode,
			"error_message": ProcessingCancelledMessage,
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	_ = s.StampAuthorizationFailure(ctx, *doc, ProcessingCancelledCode, ProcessingCancelledMessage)
	return s.GetDocument(ctx, organizationID, documentID)
}

// StampAuthorizationFailure writes the failure code and message onto the
// NF-e/NFS-e extension so the detail screen can show them without waiting
// for a gateway payload.
func (s *Service) StampAuthorizationFailure(ctx context.Context, doc Document, code, message string) error {
	code = strings.TrimSpace(code)
	message = strings.TrimSpace(message)
	if code == "" && message == "" {
		return nil
	}
	if strings.EqualFold(doc.DocumentType, "nfse") {
		_, err := s.pool.Exec(ctx, `
			update organization_nfse
			set authorization_status = 'error',
			    authorization_code = coalesce(nullif($3, ''), authorization_code),
			    authorization_message = coalesce(nullif($4, ''), authorization_message)
			where organization_id = $1 and organization_document_id = $2
		`, doc.OrganizationID, doc.ID, code, message)
		return err
	}
	_, err := s.pool.Exec(ctx, `
		update organization_nfe
		set authorization_cstat = coalesce(nullif($3, ''), authorization_cstat),
		    authorization_xmotivo = coalesce(nullif($4, ''), authorization_xmotivo)
		where organization_id = $1 and organization_document_id = $2
	`, doc.OrganizationID, doc.ID, code, message)
	return err
}

func (s *Service) payloadTypes(ctx context.Context, organizationID, documentID uuid.UUID) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		select payload_type
		from organization_document_payloads
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var payloadType string
		if err := rows.Scan(&payloadType); err != nil {
			return nil, err
		}
		out = append(out, payloadType)
	}
	return out, rows.Err()
}
