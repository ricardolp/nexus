package inbound

import (
	"bytes"
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
)

// pipelineInflight prevents a document from being ingested twice when the
// HTTP goroutine and the inbound worker both notice it while still queued.
var pipelineInflight sync.Map

// ScheduleInboundPipeline returns immediately and runs XML enrichment +
// matching in the background so the upload/receive HTTP request does not
// wait on SAP. Durable fallback: inbound_orchestrator_worker also claims
// inbound documents left in processing_status=queued.
func (s *Service) ScheduleInboundPipeline(organizationID, companyID, documentID uuid.UUID, payload []byte, contentType string) {
	if _, loaded := pipelineInflight.LoadOrStore(documentID, true); loaded {
		return
	}
	payloadCopy := bytes.Clone(payload)
	go func() {
		defer pipelineInflight.Delete(documentID)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		if err := s.RunInboundPipeline(ctx, organizationID, companyID, documentID, payloadCopy, contentType); err != nil {
			slog.Error("inbound_pipeline_failed", "document_id", documentID, "error", err)
			failCtx, failCancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer failCancel()
			_ = s.failInboundPipeline(failCtx, organizationID, documentID, err)
		}
	}()
}

// ScheduleNFeEnrichment backfills partner/totals/taxes for a document that
// was ingested before those fields were extracted — fire-and-forget so GET
// never waits on XML parsing.
func (s *Service) ScheduleNFeEnrichment(organizationID, documentID uuid.UUID) {
	key := "enrich:" + documentID.String()
	if _, loaded := pipelineInflight.LoadOrStore(key, true); loaded {
		return
	}
	go func() {
		defer pipelineInflight.Delete(key)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		dl, err := s.fiscal.DownloadOriginalPayload(ctx, organizationID, documentID)
		if err != nil {
			slog.Error("nfe_enrich_download_failed", "document_id", documentID, "error", err)
			return
		}
		if err := s.enrichNFeFromPayload(ctx, organizationID, documentID, dl.Data, dl.ContentType); err != nil {
			slog.Error("nfe_enrich_failed", "document_id", documentID, "error", err)
		}
	}()
}

// RunInboundPipeline is the body of the background job: persist complementary
// XML fields, then run matching. Safe to call again if the process crashed
// mid-way (items are not re-inserted when they already exist).
func (s *Service) RunInboundPipeline(ctx context.Context, organizationID, companyID, documentID uuid.UUID, payload []byte, contentType string) error {
	claimed, err := s.claimInboundQueued(ctx, organizationID, documentID)
	if err != nil {
		return err
	}
	if !claimed {
		return s.enrichNFeFromPayload(ctx, organizationID, documentID, payload, contentType)
	}
	if err := s.enrichNFeFromPayload(ctx, organizationID, documentID, payload, contentType); err != nil {
		slog.Error("nfe_enrich_failed", "document_id", documentID, "error", err)
	}
	return s.IngestInbound(ctx, organizationID, companyID, documentID, payload, contentType)
}

func (s *Service) claimInboundQueued(ctx context.Context, organizationID, documentID uuid.UUID) (bool, error) {
	var claimed bool
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_documents
			set processing_status = $3, updated_at = now(), version = version + 1
			where organization_id = $1 and id = $2
			  and direction = 'inbound'
			  and processing_status = $4
		`, organizationID, documentID, fiscal.ProcessingProcessing, fiscal.ProcessingQueued)
		if err != nil {
			return err
		}
		claimed = tag.RowsAffected() == 1
		return nil
	})
	return claimed, err
}

func (s *Service) failInboundPipeline(ctx context.Context, organizationID, documentID uuid.UUID, pipelineErr error) error {
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusFailed, fiscal.ProcessingFailed, "fiscal.inbound.pipeline_failed.v1", map[string]any{
			"reason": pipelineErr.Error(),
		})
	})
}
