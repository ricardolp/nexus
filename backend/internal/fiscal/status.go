package fiscal

const (
	StatusReceived   = "received"
	StatusSubmitted  = "submitted"
	StatusAuthorized = "authorized"
	StatusRejected   = "rejected"
	StatusFailed     = "failed"

	ProcessingPending    = "pending"
	ProcessingQueued     = "queued"
	ProcessingProcessing = "processing"
	ProcessingWaiting    = "waiting_external"
	ProcessingRetry      = "retry_scheduled"
	ProcessingFailed     = "failed"
	ProcessingCompleted  = "completed"
)

// IsTerminalStatus returns true when business status no longer changes in the happy path.
func IsTerminalStatus(status string) bool {
	switch status {
	case StatusAuthorized, StatusRejected, StatusFailed:
		return true
	default:
		return false
	}
}

// ServiceCodeFor builds organization_company_services.code from type + direction.
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
	default:
		return "", "", false
	}
}
