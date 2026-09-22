package inbound

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func TestErrIfCannotReset_AllowsInboundNFeWithoutSAPDocs(t *testing.T) {
	t.Parallel()

	doc := &fiscal.Document{
		Direction:        "inbound",
		DocumentType:     "nfe",
		Status:           DocStatusReadyForPosting,
		ProcessingStatus: fiscal.ProcessingWaiting,
	}
	if err := errIfCannotReset(doc, []PlanStep{{Status: PlanStepStatusFailed}}); err != nil {
		t.Fatalf("expected reset allowed, got %v", err)
	}
}

func TestErrIfCannotReset_RejectsGeneratedSAPDocument(t *testing.T) {
	t.Parallel()

	doc := &fiscal.Document{
		Direction:        "inbound",
		DocumentType:     "nfe",
		Status:           DocStatusReadyForPosting,
		ProcessingStatus: fiscal.ProcessingWaiting,
	}
	n := "5000001234"
	err := errIfCannotReset(doc, []PlanStep{{Status: PlanStepStatusDone, SAPDocumentNumber: &n}})
	assertConflictCode(t, err, "document_has_generated_sap_documents")
}

func TestErrIfCannotReset_RejectsRunningStep(t *testing.T) {
	t.Parallel()

	doc := &fiscal.Document{
		Direction:        "inbound",
		DocumentType:     "nfe",
		Status:           DocStatusReadyForPosting,
		ProcessingStatus: fiscal.ProcessingWaiting,
	}
	err := errIfCannotReset(doc, []PlanStep{{Status: PlanStepStatusRunning}})
	assertConflictCode(t, err, "step_running")
}

func TestErrIfCannotReset_RejectsOutbound(t *testing.T) {
	t.Parallel()

	doc := &fiscal.Document{
		Direction:        "outbound",
		DocumentType:     "nfe",
		ProcessingStatus: fiscal.ProcessingWaiting,
	}
	err := errIfCannotReset(doc, nil)
	assertConflictCode(t, err, "document_not_resettable")
}

func TestHasGeneratedSAPDocument(t *testing.T) {
	t.Parallel()

	if hasGeneratedSAPDocument(nil) {
		t.Fatal("empty steps should allow reset")
	}
	blank := "  "
	if hasGeneratedSAPDocument([]PlanStep{{SAPDocumentNumber: &blank}}) {
		t.Fatal("blank sap_document_number is not a generated document")
	}
	n := "4500012345"
	if !hasGeneratedSAPDocument([]PlanStep{{SAPDocumentNumber: &n}}) {
		t.Fatal("expected generated document")
	}
}

func TestIdempotencyKeyIncludesPlanVersion(t *testing.T) {
	t.Parallel()

	docID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	v1 := idempotencyKey(docID, 1, StepPostGoodsReceipt, 1)
	v2 := idempotencyKey(docID, 2, StepPostGoodsReceipt, 1)
	if v1 == v2 {
		t.Fatal("reset/rebuild must not reuse the same step idempotency key across plan versions")
	}
	if v1 != "11111111-1111-1111-1111-111111111111:1:POST_GOODS_RECEIPT:1" {
		t.Fatalf("v1=%s", v1)
	}
	if v2 != "11111111-1111-1111-1111-111111111111:2:POST_GOODS_RECEIPT:1" {
		t.Fatalf("v2=%s", v2)
	}
}

func assertConflictCode(t *testing.T, err error, code string) {
	t.Helper()
	var de *domainerr.Error
	if !errors.As(err, &de) {
		t.Fatalf("expected domainerr, got %v", err)
	}
	if de.Code != code {
		t.Fatalf("code=%s, want %s", de.Code, code)
	}
}
