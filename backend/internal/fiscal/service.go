package fiscal

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

type Service struct {
	pool   *db.Pool
	store  storage.ObjectStore
	orgs   *organization.Service
	prefix string
}

func NewService(pool *db.Pool, store storage.ObjectStore, orgs *organization.Service, storagePrefix string) *Service {
	return &Service{pool: pool, store: store, orgs: orgs, prefix: storagePrefix}
}

func (s *Service) Receive(ctx context.Context, in ReceiveInput) (*ReceiveResult, error) {
	norm, err := NormalizeReceiveInput(in)
	if err != nil {
		return nil, err
	}
	docType := norm.DocumentType
	direction := norm.Direction
	contentType := norm.ContentType
	serviceCode := norm.ServiceCode

	nfe := in.NFe
	if docType == "nfe" {
		nfe = mergeNFe(in.NFe, extractNFeFromPayload(in.Payload))
	}

	company, err := s.resolveCompany(ctx, in.OrganizationID, in.OrganizationCompanyID, direction, nfe)
	if err != nil {
		return nil, err
	}
	companyID := company.ID
	env := in.Environment
	if env == "" {
		env = company.Environment
	}

	ok, err := s.orgs.HasCompanyService(ctx, in.OrganizationID, companyID, serviceCode)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, domainerr.Validation("document_service_disabled", "The requested fiscal service is not enabled for this company.")
	}

	requestHash := crypto.SHA256Hex(in.Payload)

	// Idempotência: se já existe e hash bate, devolve o documento.
	existing, err := s.findByIdempotency(ctx, in.OrganizationID, companyID, in.SourceSystem, in.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		same, err := s.sameRequestHash(ctx, existing.ID, requestHash)
		if err != nil {
			return nil, err
		}
		if !same {
			return nil, domainerr.Conflict("idempotency_key_reuse", "Idempotency-Key reused with a different payload")
		}
		return &ReceiveResult{Document: existing, Replayed: true}, nil
	}

	now := time.Now().UTC()
	doc := &Document{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: companyID,
		DocumentType:          docType,
		Direction:             direction,
		Environment:           env,
		SourceSystem:          in.SourceSystem,
		IdempotencyKey:        in.IdempotencyKey,
		Status:                StatusReceived,
		ProcessingStatus:      ProcessingQueued,
		CurrentVersion:        1,
		CorrelationID:         in.CorrelationID,
		TraceID:               in.TraceID,
		ReceivedAt:            now,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	if in.ExternalID != "" {
		doc.ExternalID = &in.ExternalID
	}
	if in.SourceDocumentID != "" {
		doc.SourceDocumentID = &in.SourceDocumentID
	}
	if in.DocumentKey != "" {
		doc.DocumentKey = &in.DocumentKey
	}

	objectKey := storage.ObjectKey(s.prefix, in.OrganizationID.String(), doc.ID.String(), "original_request", "payload.bin")
	if err := s.store.Put(ctx, objectKey, contentType, in.Payload); err != nil {
		return nil, err
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_documents (
				id, organization_id, organization_company_id, document_type, direction, environment,
				external_id, source_system, source_document_id, idempotency_key, document_key,
				status, processing_status, current_version, correlation_id, trace_id,
				received_at, created_at, updated_at
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
			)
		`,
			doc.ID, doc.OrganizationID, doc.OrganizationCompanyID, doc.DocumentType, doc.Direction, doc.Environment,
			doc.ExternalID, doc.SourceSystem, doc.SourceDocumentID, doc.IdempotencyKey, doc.DocumentKey,
			doc.Status, doc.ProcessingStatus, doc.CurrentVersion, doc.CorrelationID, doc.TraceID,
			doc.ReceivedAt, doc.CreatedAt, doc.UpdatedAt,
		)
		if err != nil {
			if strings.Contains(err.Error(), "organization_documents") && strings.Contains(err.Error(), "unique") {
				return domainerr.Conflict("idempotency_key_reuse", "Document already received")
			}
			return err
		}

		payloadID := ids.New()
		_, err = tx.Exec(ctx, `
			insert into organization_document_payloads (
				id, organization_id, organization_document_id, payload_type, content_type,
				storage_object_key, sha256, size_bytes, contains_sensitive_data, created_at
			) values ($1,$2,$3,'original_request',$4,$5,$6,$7,true,$8)
		`, payloadID, in.OrganizationID, doc.ID, contentType, objectKey, requestHash, len(in.Payload), now)
		if err != nil {
			return err
		}

		if docType == "nfe" {
			var accessKey, series, number, model, issuerCNPJ, recipient string
			var issuedAt *time.Time
			meta := []byte(`{}`)
			if nfe != nil {
				accessKey, series, number, model = nfe.AccessKey, nfe.Series, nfe.Number, nfe.Model
				issuerCNPJ, recipient, issuedAt = nfe.IssuerCNPJ, nfe.RecipientDocument, nfe.IssuedAt
				if len(nfe.MetadataJSON) > 0 {
					meta = nfe.MetadataJSON
				}
			}
			_, err = tx.Exec(ctx, `
				insert into organization_nfe (
					organization_document_id, organization_id, access_key, series, number, model,
					issuer_cnpj, recipient_document, issued_at, metadata_json
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			`, doc.ID, in.OrganizationID, nullEmpty(accessKey), nullEmpty(series), nullEmpty(number), nullEmpty(model),
				nullEmpty(issuerCNPJ), nullEmpty(recipient), issuedAt, meta)
			if err != nil {
				return err
			}
		} else {
			nfse := in.NFSe
			if nfse == nil {
				nfse = &NFSeExtension{}
			}
			_, err = tx.Exec(ctx, `
				insert into organization_nfse (
					organization_document_id, organization_id, municipality_code, provider_code, rps_number, rps_series, metadata_json
				) values ($1,$2,$3,$4,$5,$6,'{}'::jsonb)
			`, doc.ID, in.OrganizationID, nullEmpty(nfse.MunicipalityCode), nullEmpty(nfse.ProviderCode), nullEmpty(nfse.RPSNumber), nullEmpty(nfse.RPSSeries))
			if err != nil {
				return err
			}
		}

		toStatus := doc.Status
		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, correlation_id, trace_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,null,$5,$6,$7,$8,$9,'{}'::jsonb,$10)
		`, ids.New(), in.OrganizationID, doc.ID, messaging.EventDocumentReceived, toStatus, in.ActorType, nullEmpty(in.ActorID), in.CorrelationID, in.TraceID, now)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			insert into request_traces (
				id, organization_id, correlation_id, trace_id, span_name, actor_type, actor_id,
				http_method, http_path, http_status, request_hash, storage_object_key, started_at, finished_at, created_at
			) values ($1,$2,$3,$4,'inbound.fiscal_documents', $5,$6,'POST',$7,202,$8,$9,$10,$10,$10)
		`, ids.New(), in.OrganizationID, in.CorrelationID, in.TraceID, in.ActorType, nullEmpty(in.ActorID),
			"/v1/fiscal_documents/"+docType, requestHash, objectKey, now)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			insert into idempotency_records (
				id, organization_id, scope, idempotency_key, request_hash, status, response_status, response_body, expires_at, created_at
			) values ($1,$2,'fiscal_documents',$3,$4,'completed',202,$5, now() + interval '24 hours', $6)
		`, ids.New(), in.OrganizationID, in.IdempotencyKey, requestHash, mustJSON(map[string]any{
			"document_id": doc.ID,
			"trace_id":    doc.TraceID,
			"status":      doc.Status,
		}), now)
		if err != nil {
			return err
		}

		_, err = messaging.InsertOutbox(ctx, tx, in.OrganizationID, "organization_documents", doc.ID, messaging.EventDocumentReceived, map[string]any{
			"document_id": doc.ID,
			"status":      doc.Status,
		})
		return err
	})
	if err != nil {
		return nil, err
	}

	return &ReceiveResult{Document: doc, Replayed: false}, nil
}

// resolveCompany finds the target organization_company either by the explicit
// organization_company_id or, when absent, by the CNPJ already carried in the
// NFe extension: the issuer for outbound documents (the org is emitting), the
// recipient for inbound ones (the org is receiving). NFSe payloads and callers
// that omit both must pass organization_company_id explicitly.
func (s *Service) resolveCompany(ctx context.Context, organizationID, companyID uuid.UUID, direction string, nfe *NFeExtension) (*organization.Company, error) {
	if companyID != uuid.Nil {
		return s.orgs.GetCompany(ctx, organizationID, companyID)
	}
	if nfe == nil {
		return nil, domainerr.Validation("missing_company", "organization_company_id is required, or nfe.issuer_cnpj/recipient_document must be provided to resolve it")
	}
	cnpj := nfe.IssuerCNPJ
	if direction == "inbound" {
		cnpj = nfe.RecipientDocument
	}
	if strings.TrimSpace(cnpj) == "" {
		return nil, domainerr.Validation("missing_company", "organization_company_id is required, or nfe.issuer_cnpj/recipient_document must be provided to resolve it")
	}
	return s.orgs.GetCompanyByCNPJ(ctx, organizationID, cnpj)
}

// OriginalPayloadObjectKey returns the object storage key of the document's
// original request payload — what MessagingProvider hands the nfe-gateway
// so it can build/sign the NF-e, without the raw XML/JSON ever travelling
// through RabbitMQ (see 08_messaging_and_workers.md).
func (s *Service) OriginalPayloadObjectKey(ctx context.Context, documentID uuid.UUID) (string, error) {
	var key string
	err := s.pool.QueryRow(ctx, `
		select storage_object_key from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at asc limit 1
	`, documentID).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domainerr.NotFound("payload_not_found", "Original request payload not found")
	}
	if err != nil {
		return "", err
	}
	return key, nil
}

// DocumentPayloadDownload is what a client needs to stream a document's
// original XML/JSON back out: the bytes themselves plus enough metadata to
// set sane HTTP response headers.
type DocumentPayloadDownload struct {
	Document    *Document
	Data        []byte
	ContentType string
	Filename    string
}

// DownloadOriginalPayload fetches a document's original request payload for
// a user-initiated download — reuses the same storage_object_key lookup
// OriginalPayloadObjectKey already does internally for MessagingProvider,
// but also resolves content_type/filename and actually reads the bytes back
// out of the (encrypted-at-rest) object store.
func (s *Service) DownloadOriginalPayload(ctx context.Context, organizationID, documentID uuid.UUID) (*DocumentPayloadDownload, error) {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return nil, err
	}

	var objectKey, contentType string
	err = s.pool.QueryRow(ctx, `
		select storage_object_key, content_type from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at asc limit 1
	`, documentID).Scan(&objectKey, &contentType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("payload_not_found", "Original request payload not found")
	}
	if err != nil {
		return nil, err
	}

	data, err := s.store.Get(ctx, objectKey)
	if err != nil {
		return nil, err
	}

	name := doc.ID.String()
	if doc.DocumentKey != nil && *doc.DocumentKey != "" {
		name = *doc.DocumentKey
	} else if doc.ExternalID != nil && *doc.ExternalID != "" {
		name = *doc.ExternalID
	}
	ext := ".xml"
	if strings.Contains(contentType, "json") {
		ext = ".json"
	}

	return &DocumentPayloadDownload{Document: doc, Data: data, ContentType: contentType, Filename: name + ext}, nil
}

func (s *Service) GetDocument(ctx context.Context, organizationID, documentID uuid.UUID) (*Document, error) {
	return s.scanDocument(ctx, `
		select id, organization_id, organization_company_id, document_type, direction, environment,
		       external_id, source_system, source_document_id, idempotency_key, document_key,
		       status, processing_status, current_version, correlation_id, trace_id,
		       received_at, completed_at, created_at, updated_at
		from organization_documents
		where organization_id = $1 and id = $2
	`, organizationID, documentID)
}

// DeleteManualUpload permanently removes a document created through the
// manual XML upload path, along with its extension row, items, matches,
// validations, execution plan and stored payload — so the same XML (same
// access key) can be re-imported without colliding on its own idempotency
// key. Deliberately restricted to source_system == "manual_upload": NF-e
// received automatically from SEFAZ or issued through SAP integrations
// carry a legal retention obligation and must never become erasable through
// the app, so this can't be repurposed into a general "delete a fiscal
// document" tool. Child rows (organization_nfe, _items, matches,
// validations, execution plan/steps, document events/payloads) all cascade
// via FK on organization_documents — only idempotency_records (keyed by
// idempotency_key, not a FK to the document) needs an explicit delete.
func (s *Service) DeleteManualUpload(ctx context.Context, organizationID, documentID uuid.UUID) error {
	doc, err := s.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return err
	}
	if doc.SourceSystem != "manual_upload" {
		return domainerr.Forbidden("Only manually uploaded documents can be deleted")
	}

	rows, err := s.pool.Query(ctx, `select storage_object_key from organization_document_payloads where organization_document_id = $1`, documentID)
	if err != nil {
		return err
	}
	var objectKeys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return err
		}
		objectKeys = append(objectKeys, key)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			delete from idempotency_records where organization_id = $1 and scope = 'fiscal_documents' and idempotency_key = $2
		`, organizationID, doc.IdempotencyKey); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `delete from organization_documents where id = $1 and organization_id = $2`, documentID, organizationID)
		return err
	})
	if err != nil {
		return err
	}

	for _, key := range objectKeys {
		_ = s.store.Delete(ctx, key)
	}
	return nil
}

func (s *Service) ListTimeline(ctx context.Context, organizationID, documentID uuid.UUID) ([]DocumentEvent, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_document_id, event_type, from_status, to_status,
		       actor_type, actor_id, metadata_json, occurred_at
		from organization_document_events
		where organization_id = $1 and organization_document_id = $2
		order by occurred_at asc
	`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []DocumentEvent
	for rows.Next() {
		var e DocumentEvent
		if err := rows.Scan(&e.ID, &e.OrganizationID, &e.OrganizationDocumentID, &e.EventType, &e.FromStatus, &e.ToStatus, &e.ActorType, &e.ActorID, &e.MetadataJSON, &e.OccurredAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (s *Service) ListOrganizationEvents(ctx context.Context, organizationID uuid.UUID, limit int) ([]EventListItem, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		select e.id, e.organization_id, e.organization_document_id, e.event_type, e.from_status, e.to_status,
		       e.actor_type, e.actor_id, e.metadata_json, e.occurred_at,
		       d.document_type, d.direction, d.document_key, d.source_system
		from organization_document_events e
		join organization_documents d on d.id = e.organization_document_id
		where e.organization_id = $1
		order by e.occurred_at desc
		limit $2
	`, organizationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []EventListItem
	for rows.Next() {
		var e EventListItem
		if err := rows.Scan(
			&e.ID, &e.OrganizationID, &e.OrganizationDocumentID, &e.EventType, &e.FromStatus, &e.ToStatus,
			&e.ActorType, &e.ActorID, &e.MetadataJSON, &e.OccurredAt,
			&e.DocumentType, &e.Direction, &e.DocumentKey, &e.SourceSystem,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (s *Service) RegisterManifestation(ctx context.Context, in RegisterManifestationInput) (*DocumentEvent, error) {
	manifestationType, err := ValidateManifestationType(in.ManifestationType)
	if err != nil {
		return nil, err
	}
	metadata := map[string]any{"manifestation_type": manifestationType}
	if notes := strings.TrimSpace(in.Notes); notes != "" {
		metadata["notes"] = notes
	}
	return s.insertDocumentEvent(ctx, in.OrganizationID, in.DocumentID, "manifestacao", in.ActorID, metadata)
}

func (s *Service) RegisterDeliveryReceipt(ctx context.Context, in RegisterDeliveryReceiptInput) (*DocumentEvent, error) {
	receivedBy := strings.TrimSpace(in.ReceivedBy)
	if receivedBy == "" {
		return nil, domainerr.Validation("received_by_required", "received_by is required")
	}
	receivedAt := in.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = time.Now().UTC()
	}
	metadata := map[string]any{"received_by": receivedBy, "received_at": receivedAt}
	if notes := strings.TrimSpace(in.Notes); notes != "" {
		metadata["notes"] = notes
	}
	return s.insertDocumentEvent(ctx, in.OrganizationID, in.DocumentID, "canhoto_registrado", in.ActorID, metadata)
}

func (s *Service) insertDocumentEvent(ctx context.Context, organizationID, documentID uuid.UUID, eventType string, actorID uuid.UUID, metadata map[string]any) (*DocumentEvent, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(select 1 from organization_documents where id = $1 and organization_id = $2)
	`, documentID, organizationID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, domainerr.NotFound("document_not_found", "Document not found")
	}

	meta, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	actor := actorID.String()
	event := &DocumentEvent{
		ID:                     ids.New(),
		OrganizationID:         organizationID,
		OrganizationDocumentID: documentID,
		EventType:              eventType,
		ActorType:              "user",
		ActorID:                &actor,
		MetadataJSON:           meta,
		OccurredAt:             now,
	}
	_, err = s.pool.Exec(ctx, `
		insert into organization_document_events (
			id, organization_id, organization_document_id, event_type, actor_type, actor_id, metadata_json, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8)
	`, event.ID, event.OrganizationID, event.OrganizationDocumentID, event.EventType, event.ActorType, actor, meta, now)
	if err != nil {
		return nil, err
	}
	return event, nil
}

func (s *Service) UpdateStatus(ctx context.Context, organizationID, documentID uuid.UUID, fromStatus, toStatus, processingStatus, actorType, actorID, eventType string, metadata map[string]any) error {
	now := time.Now().UTC()
	meta, _ := json.Marshal(metadata)
	if meta == nil {
		meta = []byte(`{}`)
	}

	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		var completedAt any
		if IsTerminalStatus(toStatus) {
			completedAt = now
		}
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set status = $3,
			    processing_status = $4,
			    completed_at = coalesce($5, completed_at),
			    updated_at = $6,
			    version = version + 1
			where organization_id = $1 and id = $2 and status = $7
		`, organizationID, documentID, toStatus, processingStatus, completedAt, now, fromStatus)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.Conflict("stale_document_status", "Document status changed concurrently")
		}

		_, err = tx.Exec(ctx, `
			insert into organization_document_events (
				id, organization_id, organization_document_id, event_type, from_status, to_status,
				actor_type, actor_id, metadata_json, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, eventType, fromStatus, toStatus, actorType, nullEmpty(actorID), meta, now)
		if err != nil {
			return err
		}

		_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, messaging.EventDocumentStatusChanged, map[string]any{
			"document_id": documentID,
			"from_status": fromStatus,
			"to_status":   toStatus,
		})
		return err
	})
}

func (s *Service) ClaimQueuedDocuments(ctx context.Context, limit int) ([]Document, error) {
	var docs []Document
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id, organization_id, organization_company_id, document_type, direction, environment,
			       external_id, source_system, source_document_id, idempotency_key, document_key,
			       status, processing_status, current_version, correlation_id, trace_id,
			       received_at, completed_at, created_at, updated_at
			from organization_documents
			where processing_status in ('queued','retry_scheduled') and status = 'received' and direction = 'outbound'
			order by received_at
			limit $1
			for update skip locked
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var d Document
			if err := rows.Scan(
				&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.DocumentType, &d.Direction, &d.Environment,
				&d.ExternalID, &d.SourceSystem, &d.SourceDocumentID, &d.IdempotencyKey, &d.DocumentKey,
				&d.Status, &d.ProcessingStatus, &d.CurrentVersion, &d.CorrelationID, &d.TraceID,
				&d.ReceivedAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
			); err != nil {
				return err
			}
			docs = append(docs, d)
		}

		for _, d := range docs {
			_, err := tx.Exec(ctx, `
				update organization_documents
				set processing_status = 'processing', updated_at = now(), version = version + 1
				where id = $1
			`, d.ID)
			if err != nil {
				return err
			}
		}
		return nil
	})
	return docs, err
}

func (s *Service) findByIdempotency(ctx context.Context, organizationID, companyID uuid.UUID, sourceSystem, key string) (*Document, error) {
	doc, err := s.scanDocument(ctx, `
		select id, organization_id, organization_company_id, document_type, direction, environment,
		       external_id, source_system, source_document_id, idempotency_key, document_key,
		       status, processing_status, current_version, correlation_id, trace_id,
		       received_at, completed_at, created_at, updated_at
		from organization_documents
		where organization_id = $1 and organization_company_id = $2 and source_system = $3 and idempotency_key = $4
	`, organizationID, companyID, sourceSystem, key)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "document_not_found" {
			return nil, nil
		}
		return nil, err
	}
	return doc, nil
}

func (s *Service) sameRequestHash(ctx context.Context, documentID uuid.UUID, hash string) (bool, error) {
	var stored string
	err := s.pool.QueryRow(ctx, `
		select sha256 from organization_document_payloads
		where organization_document_id = $1 and payload_type = 'original_request'
		order by created_at asc limit 1
	`, documentID).Scan(&stored)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return stored == hash, nil
}

func (s *Service) scanDocument(ctx context.Context, query string, args ...any) (*Document, error) {
	row := s.pool.QueryRow(ctx, query, args...)
	var d Document
	if err := row.Scan(
		&d.ID, &d.OrganizationID, &d.OrganizationCompanyID, &d.DocumentType, &d.Direction, &d.Environment,
		&d.ExternalID, &d.SourceSystem, &d.SourceDocumentID, &d.IdempotencyKey, &d.DocumentKey,
		&d.Status, &d.ProcessingStatus, &d.CurrentVersion, &d.CorrelationID, &d.TraceID,
		&d.ReceivedAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("document_not_found", "Document not found")
		}
		return nil, err
	}
	return &d, nil
}

func nullEmpty(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte(`{}`)
	}
	return b
}
