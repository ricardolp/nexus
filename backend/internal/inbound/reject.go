package inbound

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type RejectInput struct {
	OrganizationID uuid.UUID
	DocumentID     uuid.UUID
	Reason         string
	ActorUserID    uuid.UUID
}

// Reject rejects an inbound document at any non-terminal point in the
// pipeline (spec §23-24): cancels any open execution plan/steps and
// transitions the document to REJECTED. Terminal documents (already
// completed/rejected/failed) cannot be rejected again.
func (s *Service) Reject(ctx context.Context, in RejectInput) error {
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		return domainerr.Validation("invalid_reject", "reason is required")
	}

	return s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		doc, err := s.fiscal.GetDocument(ctx, in.OrganizationID, in.DocumentID)
		if err != nil {
			return err
		}
		if IsTerminalInboundStatus(doc.Status) || fiscal.IsTerminalStatus(doc.Status) {
			return domainerr.Conflict("document_already_terminal", "Document is already in a terminal state: "+doc.Status)
		}

		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `
			update organization_execution_plan_steps
			set status = 'SKIPPED', finished_at = $3, updated_at = $3
			where organization_id = $1 and organization_document_id = $2 and status not in ('DONE','SKIPPED','FAILED')
		`, in.OrganizationID, in.DocumentID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update organization_execution_plans
			set status = 'CANCELLED', updated_at = $3
			where organization_id = $1 and organization_document_id = $2 and status not in ('COMPLETED','CANCELLED','FAILED')
		`, in.OrganizationID, in.DocumentID, now); err != nil {
			return err
		}
		if err := markDocumentStatus(ctx, tx, in.OrganizationID, in.DocumentID, DocStatusRejected, fiscal.ProcessingCompleted, "fiscal.inbound.rejected.v1", map[string]any{"reason": reason}); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound.document.reject",
			ResourceType:   "organization_documents",
			ResourceID:     in.DocumentID.String(),
			Reason:         reason,
		})
	})
}
