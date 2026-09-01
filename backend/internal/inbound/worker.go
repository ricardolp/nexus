package inbound

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Worker drives AUTO execution plan steps — the counterpart to the manual
// "advance" endpoint. Both ultimately call Service.AdvanceStep; the only
// difference is who triggers it and when.
type Worker struct {
	svc *Service
}

func NewWorker(svc *Service) *Worker {
	return &Worker{svc: svc}
}

type claimedStep struct {
	ID                     uuid.UUID
	OrganizationID         uuid.UUID
	OrganizationDocumentID uuid.UUID
}

// ProcessBatch claims up to limit READY/AUTO steps (across every tenant —
// same cross-tenant polling shape as fiscal.Worker.ClaimQueuedDocuments)
// and runs each via AdvanceStep. Errors advancing an individual step are
// logged, not returned, so one bad step never blocks the rest of the batch.
func (w *Worker) ProcessBatch(ctx context.Context, limit int) (int, error) {
	ingested, err := w.processQueuedInbound(ctx, limit)
	if err != nil {
		return 0, err
	}
	claimed, err := w.claimReadySteps(ctx, limit)
	if err != nil {
		return ingested, err
	}
	for _, st := range claimed {
		if _, err := w.svc.AdvanceStep(ctx, AdvanceStepInput{
			OrganizationID: st.OrganizationID,
			DocumentID:     st.OrganizationDocumentID,
			StepID:         st.ID,
			Action:         "run",
			ActorType:      "worker",
			ActorID:        "inbound_orchestrator_worker",
		}); err != nil {
			slog.Default().Error("inbound_advance_step_failed", "step_id", st.ID, "error", err)
		}
	}
	return ingested + len(claimed), nil
}

type claimedInbound struct {
	ID                    uuid.UUID
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
}

func (w *Worker) processQueuedInbound(ctx context.Context, limit int) (int, error) {
	var claimed []claimedInbound
	err := w.svc.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			update organization_documents
			set processing_status = 'processing', updated_at = now(), version = version + 1
			where id in (
				select id from organization_documents
				where direction = 'inbound' and processing_status = 'queued' and document_type = 'nfe'
				order by received_at
				limit $1
				for update skip locked
			)
			returning id, organization_id, organization_company_id
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c claimedInbound
			if err := rows.Scan(&c.ID, &c.OrganizationID, &c.OrganizationCompanyID); err != nil {
				return err
			}
			claimed = append(claimed, c)
		}
		return rows.Err()
	})
	if err != nil {
		return 0, err
	}
	for _, doc := range claimed {
		dl, err := w.svc.fiscal.DownloadOriginalPayload(ctx, doc.OrganizationID, doc.ID)
		if err != nil {
			slog.Default().Error("inbound_pipeline_download_failed", "document_id", doc.ID, "error", err)
			_ = w.svc.failInboundPipeline(ctx, doc.OrganizationID, doc.ID, err)
			continue
		}
		if err := w.svc.enrichNFeFromPayload(ctx, doc.OrganizationID, doc.ID, dl.Data, dl.ContentType); err != nil {
			slog.Default().Error("nfe_enrich_failed", "document_id", doc.ID, "error", err)
		}
		if err := w.svc.IngestInbound(ctx, doc.OrganizationID, doc.OrganizationCompanyID, doc.ID, dl.Data, dl.ContentType); err != nil {
			slog.Default().Error("inbound_pipeline_failed", "document_id", doc.ID, "error", err)
			_ = w.svc.failInboundPipeline(ctx, doc.OrganizationID, doc.ID, err)
		}
	}
	return len(claimed), nil
}

func (w *Worker) claimReadySteps(ctx context.Context, limit int) ([]claimedStep, error) {
	var claimed []claimedStep
	err := w.svc.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			update organization_execution_plan_steps
			set status = 'RUNNING', updated_at = now()
			where id in (
				select id from organization_execution_plan_steps
				where status = 'READY' and mode = 'AUTO'
				order by created_at
				limit $1
				for update skip locked
			)
			returning id, organization_id, organization_document_id
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c claimedStep
			if err := rows.Scan(&c.ID, &c.OrganizationID, &c.OrganizationDocumentID); err != nil {
				return err
			}
			claimed = append(claimed, c)
		}
		return rows.Err()
	})
	return claimed, err
}
