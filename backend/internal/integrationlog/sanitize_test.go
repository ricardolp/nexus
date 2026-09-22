package integrationlog_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/integrationlog"
)

func TestLevelFromStatus(t *testing.T) {
	cases := map[int]string{
		0:   integrationlog.LevelInfo,
		200: integrationlog.LevelInfo,
		399: integrationlog.LevelInfo,
		400: integrationlog.LevelWarn,
		404: integrationlog.LevelWarn,
		500: integrationlog.LevelError,
		503: integrationlog.LevelError,
	}
	for status, want := range cases {
		if got := integrationlog.LevelFromStatus(status); got != want {
			t.Fatalf("status %d: got %q want %q", status, got, want)
		}
	}
}

func TestSanitizeHeaders(t *testing.T) {
	h := http.Header{}
	h.Set("Authorization", "Bearer secret-token")
	h.Set("X-Org-Token", "org-secret")
	h.Set("Content-Type", "application/json")
	h.Set("x_webhook_signature", "sig")

	out := integrationlog.SanitizeHeaders(h)
	if out["Authorization"] != "[REDACTED]" {
		t.Fatalf("Authorization: %q", out["Authorization"])
	}
	if out["X-Org-Token"] != "[REDACTED]" {
		t.Fatalf("X-Org-Token: %q", out["X-Org-Token"])
	}
	foundSig := false
	for k, v := range out {
		if strings.EqualFold(k, "x_webhook_signature") {
			foundSig = true
			if v != "[REDACTED]" {
				t.Fatalf("signature %s: %q", k, v)
			}
		}
	}
	if !foundSig {
		t.Fatalf("signature header missing: %#v", out)
	}
	if out["Content-Type"] != "application/json" {
		t.Fatalf("Content-Type: %q", out["Content-Type"])
	}
}

func TestTruncateBody(t *testing.T) {
	body := []byte(stringsRepeat("a", 100))
	got := integrationlog.TruncateBody(body, 10)
	if len(got) != 10 {
		t.Fatalf("len=%d", len(got))
	}
}

func TestSanitizeURL(t *testing.T) {
	got := integrationlog.SanitizeURL("https://example.com/token?client_secret=abc&ok=1")
	if !contains(got, "client_secret=%5BREDACTED%5D") && !contains(got, "client_secret=[REDACTED]") {
		// url.Values.Encode escapes brackets
		if !contains(got, "client_secret=") || contains(got, "client_secret=abc") {
			t.Fatalf("got %q", got)
		}
	}
	if contains(got, "client_secret=abc") {
		t.Fatalf("secret leaked: %q", got)
	}
}

func stringsRepeat(s string, n int) string {
	b := make([]byte, 0, n*len(s))
	for i := 0; i < n; i++ {
		b = append(b, s...)
	}
	return string(b)
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})())
}
