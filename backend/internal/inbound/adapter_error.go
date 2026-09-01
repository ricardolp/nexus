package inbound

import "errors"

// adapterFailure marks an error as having come directly from a sap.Adapter
// call (network/DNS/timeout/auth against the configured SAP CPI/S4 endpoint)
// rather than from our own database. The distinction matters: a database
// error is a real infrastructure fault and should surface as a 500, but SAP
// being unreachable is an expected, recoverable condition — matching stops,
// but the document (and whatever items/matches were already persisted)
// still lands in the system at ACTION_REQUIRED instead of being rolled back
// behind an opaque 500. A human (or a later Reprocess once SAP is back)
// picks it up from there, same as any other action-required document.
type adapterFailure struct{ err error }

func (e *adapterFailure) Error() string { return e.err.Error() }
func (e *adapterFailure) Unwrap() error { return e.err }

func wrapAdapterErr(err error) error {
	if err == nil {
		return nil
	}
	return &adapterFailure{err: err}
}

// asAdapterFailure unwraps an adapterFailure, if err is (or wraps) one.
func asAdapterFailure(err error) (cause error, ok bool) {
	var af *adapterFailure
	if errors.As(err, &af) {
		return af.err, true
	}
	return nil, false
}
