package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/url"
	"time"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// SignPayload builds HMAC-SHA256(secret, timestamp + "." + body) as hex.
func SignPayload(secret, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// ValidateURL rejects non-http(s) and private network targets (SSRF guard).
// localhost is allowed for local development.
func ValidateURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return domainerr.Validation("invalid_webhook_url", "Webhook URL must be absolute http(s)")
	}
	host := u.Hostname()
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
			return domainerr.Validation("ssrf_blocked", "Webhook URL points to a private network")
		}
	}
	return nil
}

// NextBackoff returns exponential backoff capped at 2^6 seconds.
func NextBackoff(attempt int) time.Duration {
	shift := attempt
	if shift > 6 {
		shift = 6
	}
	if shift < 0 {
		shift = 0
	}
	return time.Duration(1<<shift) * time.Second
}

// IsRetryableHTTPStatus follows architecture rules for webhook retries.
func IsRetryableHTTPStatus(status int) bool {
	return status == 408 || status == 425 || status == 429 || status >= 500
}

// IsSuccessHTTPStatus returns true for 2xx.
func IsSuccessHTTPStatus(status int) bool {
	return status >= 200 && status < 300
}
