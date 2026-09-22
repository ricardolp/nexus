package inbound

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type ResetToImportedInput struct {
	OrganizationID uuid.UUID
	DocumentID     uuid.UUID
	ActorUserID    uuid.UUID
}

// ResetToImported returns an inbound NF-e to the original imported state
// (status received, processing queued) so matching and the execution plan
// can start again from the purchase-order step. Refused when any plan step
// already produced a SAP document number (PO / MIGO / MIRO / etc.) — those
// postings are not reversed here.
func (s *Service) ResetToImported(ctx context.Context, in ResetToImportedInput) error {
	var companyID uuid.UUID
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		doc, err := s.fiscal.GetDocument(ctx, in.OrganizationID, in.DocumentID)
		if err != nil {
			return err
		}
		steps, err := listPlanSteps(ctx, tx, in.OrganizationID, in.DocumentID)
		if err != nil {
			return err
		}
		if err := errIfCannotReset(doc, steps); err != nil {
			return err
		}
		companyID = doc.OrganizationCompanyID

		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `
			update organization_execution_plan_steps
			set status = 'SKIPPED', finished_at = coalesce(finished_at, $3), updated_at = $3
			where organization_id = $1 and organization_document_id = $2 and status not in ('DONE','SKIPPED')
		`, in.OrganizationID, in.DocumentID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update organization_execution_plans
			set status = 'CANCELLED', updated_at = $3
			where organization_id = $1 and organization_document_id = $2 and status <> 'CANCELLED'
		`, in.OrganizationID, in.DocumentID, now); err != nil {
			return err
		}
		if err := resetDocumentMatchingState(ctx, tx, in.OrganizationID, in.DocumentID); err != nil {
			return err
		}
		if err := resetDocumentToImported(ctx, tx, in.OrganizationID, in.DocumentID); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound.document.reset",
			ResourceType:   "organization_documents",
			ResourceID:     in.DocumentID.String(),
			Reason:         "Reset para recomeçar a integração a partir do pedido",
		})
	})
	if err != nil {
		return err
	}

	dl, err := s.fiscal.DownloadOriginalPayload(ctx, in.OrganizationID, in.DocumentID)
	if err != nil {
		slog.Error("inbound_reset_download_failed", "document_id", in.DocumentID, "error", err)
		return nil
	}
	s.ScheduleInboundPipeline(in.OrganizationID, companyID, in.DocumentID, dl.Data, dl.ContentType)
	return nil
}

func errIfCannotReset(doc *fiscal.Document, steps []PlanStep) error {
	if !strings.EqualFold(doc.Direction, "inbound") || !strings.EqualFold(doc.DocumentType, "nfe") {
		return domainerr.Conflict("document_not_resettable", "Only inbound NF-e documents can be reset")
	}
	if strings.EqualFold(doc.ProcessingStatus, fiscal.ProcessingProcessing) {
		return domainerr.Conflict("document_processing", "Document is currently being processed")
	}
	for _, st := range steps {
		if st.Status == PlanStepStatusRunning {
			return domainerr.Conflict("step_running", "Não é possível resetar enquanto uma etapa está em execução no SAP")
		}
	}
	if hasGeneratedSAPDocument(steps) {
		return domainerr.Conflict("document_has_generated_sap_documents", "Não é possível resetar: já existe documento gerado no SAP (pedido, MIGO ou MIRO)")
	}
	return nil
}

func hasGeneratedSAPDocument(steps []PlanStep) bool {
	for _, st := range steps {
		if st.SAPDocumentNumber != nil && strings.TrimSpace(*st.SAPDocumentNumber) != "" {
			return true
		}
	}
	return false
}
