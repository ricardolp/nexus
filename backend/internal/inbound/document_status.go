package inbound

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// markDocumentStatus updates organization_documents.status/processing_status
// and records the transition (event + outbox), all within the caller's
// transaction — unlike fiscal.Service.UpdateStatus, which opens its own,
// this keeps the document status change atomic with whatever execution
// plan/step change triggered it. metadata is nil-safe (persisted as '{}'
// when nil/empty) and feeds the frontend timeline's descriptive text.
func markDocumentStatus(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, toStatus, processingStatus, eventType string, metadata map[string]any) error {
	now := time.Now().UTC()
	var completedAt any
	if toStatus == DocStatusCompleted || toStatus == DocStatusRejected || toStatus == DocStatusFailed {
		completedAt = now
	}
	if _, err := tx.Exec(ctx, `
		update organization_documents
		set status = $2, processing_status = $3, completed_at = coalesce($4, completed_at), updated_at = $5, version = version + 1
		where id = $1
	`, documentID, toStatus, processingStatus, completedAt, now); err != nil {
		return err
	}
	metaJSON, err := marshalEventMetadata(metadata)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into organization_document_events (
			id, organization_id, organization_document_id, event_type, to_status, actor_type, metadata_json, occurred_at
		) values ($1,$2,$3,$4,$5,'system',$6,$7)
	`, ids.New(), organizationID, documentID, eventType, toStatus, metaJSON, now); err != nil {
		return err
	}
	_, err = messaging.InsertOutbox(ctx, tx, organizationID, "organization_documents", documentID, eventType, map[string]any{
		"document_id": documentID,
		"to_status":   toStatus,
	})
	return err
}

// marshalEventMetadata is shared by markDocumentStatus and
// insertPlanStepEvent so every organization_document_events row gets valid,
// consistent JSON — never a Go nil that would insert SQL NULL.
func marshalEventMetadata(metadata map[string]any) ([]byte, error) {
	if len(metadata) == 0 {
		return []byte(`{}`), nil
	}
	return json.Marshal(metadata)
}
