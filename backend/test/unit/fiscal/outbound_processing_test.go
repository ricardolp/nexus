package fiscal_test

import (
	"testing"
	"time"

	"github.com/nexus/fiscal-messaging/internal/fiscal"
)

func TestClassifyCertificateWindow(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)

	code, message := fiscal.ClassifyCertificateWindow(now.Add(-time.Hour), now.Add(time.Hour), now)
	if code != "" || message != "" {
		t.Fatalf("valid window got %q %q", code, message)
	}

	code, message = fiscal.ClassifyCertificateWindow(now.Add(time.Hour), now.Add(2*time.Hour), now)
	if code != fiscal.CertificateExpiredCode || message != fiscal.CertificateNotYetValidMessage {
		t.Fatalf("not yet valid got %q %q", code, message)
	}

	code, message = fiscal.ClassifyCertificateWindow(now.Add(-2*time.Hour), now, now)
	if code != fiscal.CertificateExpiredCode || message != fiscal.CertificateExpiredMessage {
		t.Fatalf("expired got %q %q", code, message)
	}
}

func TestIssuedBeforeRegistration(t *testing.T) {
	t.Parallel()
	// Registered 2 Oct 2026 at 15:00 UTC = 12:00 in Brazil.
	registered := time.Date(2026, 10, 2, 15, 0, 0, 0, time.UTC)
	before := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	sameDay := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	after := time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC)

	if !fiscal.IssuedBeforeRegistration(before, registered) {
		t.Fatal("emission on the day before registration should be blocked")
	}
	if fiscal.IssuedBeforeRegistration(sameDay, registered) {
		t.Fatal("emission on the registration day should be allowed")
	}
	if fiscal.IssuedBeforeRegistration(after, registered) {
		t.Fatal("emission after registration should be allowed")
	}
	if fiscal.IssuedBeforeRegistration(time.Time{}, registered) {
		t.Fatal("a note without an emission date should not be blocked here")
	}

	// 02:00 UTC on 2 Oct is still 1 Oct in Brazil. A note dated 1 Oct is the same day.
	registeredLateUTC := time.Date(2026, 10, 2, 2, 0, 0, 0, time.UTC)
	if fiscal.IssuedBeforeRegistration(before, registeredLateUTC) {
		t.Fatal("emission on the Brazil calendar day of registration should be allowed")
	}
}

func TestOutboundProcessingAbortable(t *testing.T) {
	t.Parallel()

	if !fiscal.OutboundProcessingAbortable(fiscal.StatusSubmitted, fiscal.ProcessingWaiting, false) {
		t.Fatal("waiting_external without a SEFAZ payload should be abortable")
	}
	if !fiscal.OutboundProcessingAbortable(fiscal.StatusReceived, fiscal.ProcessingQueued, false) {
		t.Fatal("queued note should be abortable")
	}
	if fiscal.OutboundProcessingAbortable(fiscal.StatusSubmitted, fiscal.ProcessingWaiting, true) {
		t.Fatal("a note already sent to the authority must not be abortable")
	}
	if fiscal.OutboundProcessingAbortable(fiscal.StatusSubmitted, fiscal.ProcessingWaitingRecibo, false) {
		t.Fatal("waiting_recibo means SEFAZ already accepted the lote")
	}
	if fiscal.OutboundProcessingAbortable(fiscal.StatusAuthorized, fiscal.ProcessingCompleted, false) {
		t.Fatal("authorized notes are not in processing")
	}
	if fiscal.OutboundProcessingAbortable(fiscal.StatusFailed, fiscal.ProcessingFailed, false) {
		t.Fatal("failed notes are already stopped")
	}
}

func TestOutboundSentToAuthority(t *testing.T) {
	t.Parallel()

	if !fiscal.OutboundSentToAuthority(fiscal.ProcessingWaitingRecibo, nil) {
		t.Fatal("waiting_recibo is sent")
	}
	if !fiscal.OutboundSentToAuthority(fiscal.ProcessingWaiting, []string{"original_request", fiscal.PayloadProviderRequest}) {
		t.Fatal("provider_request means the signed XML was stored after transmission")
	}
	if fiscal.OutboundSentToAuthority(fiscal.ProcessingWaiting, []string{"original_request"}) {
		t.Fatal("the SAP payload alone is not a SEFAZ send")
	}
}

func TestStaleOutboundProcessing(t *testing.T) {
	t.Parallel()

	if !fiscal.StaleOutboundProcessing(fiscal.StatusSubmitted, fiscal.ProcessingWaiting) {
		t.Fatal("submitted/waiting_external should be retried")
	}
	if !fiscal.StaleOutboundProcessing(fiscal.StatusSubmitted, fiscal.ProcessingWaitingRecibo) {
		t.Fatal("waiting_recibo should be retried after the timeout")
	}
	if !fiscal.StaleOutboundProcessing(fiscal.StatusReceived, fiscal.ProcessingProcessing) {
		t.Fatal("a claimed note that never finished should be retried")
	}
	if fiscal.StaleOutboundProcessing(fiscal.StatusReceived, fiscal.ProcessingQueued) {
		t.Fatal("queued notes are already waiting for the worker")
	}
	if fiscal.StaleOutboundProcessing(fiscal.StatusFailed, fiscal.ProcessingFailed) {
		t.Fatal("failed notes must not be retried automatically")
	}
}

func TestOutboundNFeNaturalKey(t *testing.T) {
	t.Parallel()

	cases := []struct {
		series, number, want string
	}{
		{"000", "000017776", "nfe:55:0:17776"},
		{"0", "17776", "nfe:55:0:17776"},
		{"", "17776", "nfe:55:0:17776"},
		{"001", "30601", "nfe:55:1:30601"},
		{" 2 ", " 0034130 ", "nfe:55:2:34130"},
		{"000", "000000000", ""},
		{"000", "", ""},
	}
	for _, c := range cases {
		if got := fiscal.OutboundNFeNaturalKey(c.series, c.number); got != c.want {
			t.Errorf("OutboundNFeNaturalKey(%q, %q) = %q, want %q", c.series, c.number, got, c.want)
		}
	}
}

func TestOutboundNFSeNaturalKey(t *testing.T) {
	t.Parallel()

	cases := []struct {
		series, number, want string
	}{
		{"001", "1", "nfse:1:1"},
		{"1", "0001", "nfse:1:1"},
		{"", "1", "nfse:0:1"},
		{" 001 ", " 00012 ", "nfse:1:12"},
		{"001", "000", ""},
		{"001", "", ""},
	}
	for _, c := range cases {
		if got := fiscal.OutboundNFSeNaturalKey(c.series, c.number); got != c.want {
			t.Errorf("OutboundNFSeNaturalKey(%q, %q) = %q, want %q", c.series, c.number, got, c.want)
		}
	}
}

func TestDecideOutboundResubmission(t *testing.T) {
	t.Parallel()

	cases := []struct {
		status, processing, want string
	}{
		{fiscal.StatusAuthorized, fiscal.ProcessingCompleted, fiscal.OutboundResendAlreadyAuthorized},
		{fiscal.StatusCorrectionRegistered, fiscal.ProcessingCompleted, fiscal.OutboundResendAlreadyAuthorized},
		{fiscal.StatusCancelRequested, fiscal.ProcessingWaiting, fiscal.OutboundResendAlreadyAuthorized},
		{fiscal.StatusCancelled, fiscal.ProcessingCompleted, fiscal.OutboundResendFinalized},
		{fiscal.StatusInutilized, fiscal.ProcessingCompleted, fiscal.OutboundResendFinalized},
		{fiscal.StatusRejected, fiscal.ProcessingCompleted, fiscal.OutboundResendResubmit},
		{fiscal.StatusFailed, fiscal.ProcessingFailed, fiscal.OutboundResendResubmit},
		{fiscal.StatusReceived, fiscal.ProcessingFailed, fiscal.OutboundResendResubmit},
		{fiscal.StatusReceived, fiscal.ProcessingQueued, fiscal.OutboundResendInProcessing},
		{fiscal.StatusReceived, fiscal.ProcessingProcessing, fiscal.OutboundResendInProcessing},
		{fiscal.StatusSubmitted, fiscal.ProcessingWaiting, fiscal.OutboundResendInProcessing},
		{fiscal.StatusSubmitted, fiscal.ProcessingWaitingRecibo, fiscal.OutboundResendInProcessing},
		{fiscal.StatusContingencyPending, fiscal.ProcessingWaiting, fiscal.OutboundResendInProcessing},
	}
	for _, c := range cases {
		if got := fiscal.DecideOutboundResubmission(c.status, c.processing); got != c.want {
			t.Errorf("DecideOutboundResubmission(%q, %q) = %q, want %q", c.status, c.processing, got, c.want)
		}
	}
}
