package fiscal

const (
	StatusReceived             = "received"
	StatusSubmitted            = "submitted"
	StatusAuthorized           = "authorized"
	StatusRejected             = "rejected"
	StatusFailed               = "failed"
	StatusCancelRequested      = "cancel_requested"
	StatusCancelled            = "cancelled"
	StatusCorrectionRegistered = "correction_registered"
	StatusInutilized           = "inutilized"
	StatusContingencyPending   = "contingency_pending"

	ProcessingPending       = "pending"
	ProcessingQueued        = "queued"
	ProcessingProcessing    = "processing"
	ProcessingWaiting       = "waiting_external"
	ProcessingWaitingRecibo = "waiting_recibo"
	ProcessingRetry         = "retry_scheduled"
	ProcessingFailed        = "failed"
	ProcessingCompleted     = "completed"
)

// IsTerminalStatus returns true when business status no longer changes in the happy path.
func IsTerminalStatus(status string) bool {
	switch status {
	case StatusAuthorized, StatusRejected, StatusFailed, StatusCancelled, StatusInutilized:
		return true
	default:
		return false
	}
}

// ServiceCodeFor builds organization_services.code from type + direction.
func ServiceCodeFor(documentType, direction string) string {
	return documentType + "_" + direction
}

// EventTypeForOutcome maps provider outcome to domain event type.
func EventTypeForOutcome(outcome string) string {
	switch outcome {
	case "authorized":
		return "fiscal.document.authorized.v1"
	case "rejected":
		return "fiscal.document.rejected.v1"
	case "submitted":
		return "fiscal.document.submitted.v1"
	case "waiting_recibo":
		return "fiscal.document.waiting_recibo.v1"
	case "error":
		return "fiscal.document.failed.v1"
	case "retry":
		return "fiscal.document.retry_scheduled.v1"
	case "cancelled", "accepted_cancel":
		return "fiscal.document.cancelled.v1"
	case "correction_registered", "accepted_cce":
		return "fiscal.document.correction_registered.v1"
	case "inutilized", "accepted_inutilization":
		return "fiscal.document.inutilized.v1"
	default:
		return "fiscal.document.status_changed.v1"
	}
}

// NextStatusesFromProvider maps provider outcome to business/processing statuses.
func NextStatusesFromProvider(outcome string) (status, processing string, ok bool) {
	switch outcome {
	case "authorized":
		return StatusAuthorized, ProcessingCompleted, true
	case "rejected":
		return StatusRejected, ProcessingCompleted, true
	case "submitted":
		return StatusSubmitted, ProcessingWaiting, true
	case "waiting_recibo":
		return StatusSubmitted, ProcessingWaitingRecibo, true
	case "error":
		return StatusFailed, ProcessingFailed, true
	case "retry":
		// Calculator/SEFIN timeout: keep the note open and let the worker send it again.
		return StatusReceived, ProcessingRetry, true
	case "cancelled", "accepted_cancel":
		return StatusCancelled, ProcessingCompleted, true
	case "correction_registered", "accepted_cce":
		return StatusCorrectionRegistered, ProcessingCompleted, true
	case "inutilized", "accepted_inutilization":
		return StatusInutilized, ProcessingCompleted, true
	case "contingency_pending":
		return StatusContingencyPending, ProcessingWaiting, true
	default:
		return "", "", false
	}
}

// NextStatusesFromEventResult maps nfe-gateway event_result outcomes by event_kind.
func NextStatusesFromEventResult(eventKind, outcome string) (status, processing string, ok bool) {
	if outcome != "accepted" {
		// Cancel rejection must not bury an authorized NFS-e/NF-e as failed —
		// the document remains legally valid until SEFIN/SEFAZ accepts cancel.
		if eventKind == "cancel" {
			return StatusAuthorized, ProcessingCompleted, true
		}
		return StatusFailed, ProcessingFailed, true
	}
	switch eventKind {
	case "cancel":
		return StatusCancelled, ProcessingCompleted, true
	case "cce":
		return StatusCorrectionRegistered, ProcessingCompleted, true
	case "inutilization":
		return StatusInutilized, ProcessingCompleted, true
	default:
		return "", "", false
	}
}
