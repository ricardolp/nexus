package sap

// ClassifyError maps an adapter error to a retry decision (spec §38):
// SAP_TIMEOUT and authentication_failure are retryable (transient/infra),
// business validation errors and "not supported" are not — retrying them
// would just fail again until a human or a scenario change fixes the
// underlying cause.
func ClassifyError(err error) (code string, retryable bool) {
	if err == nil {
		return "", false
	}
	if err == ErrNotSupported {
		return "operation_not_supported", false
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		return "sap_error", false
	}
	switch apiErr.Code {
	case "sap_timeout", "authentication_failure":
		return apiErr.Code, true
	default:
		return apiErr.Code, false
	}
}
