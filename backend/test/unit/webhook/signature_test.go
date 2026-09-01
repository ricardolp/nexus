package webhook_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"

	"github.com/nexus/fiscal-messaging/internal/webhook"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestSignPayload(t *testing.T) {
	t.Parallel()

	body := helpers.ReadTestdata(t, "webhook", "sample_body.json")
	ts := "1710000000"
	secret := "s3cret"

	got := webhook.SignPayload(secret, ts, body)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	if got != want {
		t.Fatalf("signature mismatch")
	}
}

func TestValidateURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		url     string
		wantErr string
	}{
		{name: "https_ok", url: "https://hooks.example.com/fiscal"},
		{name: "localhost_ok", url: "http://localhost:8080/hook"},
		{name: "private_ip", url: "http://10.0.0.8/hook", wantErr: "ssrf_blocked"},
		{name: "invalid", url: "ftp://example.com", wantErr: "invalid_webhook_url"},
		{name: "empty", url: "", wantErr: "invalid_webhook_url"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := webhook.ValidateURL(tt.url)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			helpers.AssertDomainCode(t, err, tt.wantErr)
		})
	}
}

func TestRetryHelpers(t *testing.T) {
	t.Parallel()

	if webhook.NextBackoff(0) != time.Second || webhook.NextBackoff(10) != 64*time.Second {
		t.Fatal("backoff mismatch")
	}
	if !webhook.IsRetryableHTTPStatus(503) || webhook.IsRetryableHTTPStatus(400) {
		t.Fatal("retryable mismatch")
	}
	if !webhook.IsSuccessHTTPStatus(204) || webhook.IsSuccessHTTPStatus(301) {
		t.Fatal("success mismatch")
	}
}
