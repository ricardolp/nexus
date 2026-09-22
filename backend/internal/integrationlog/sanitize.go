package integrationlog

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

const (
	DirectionInbound  = "inbound"
	DirectionOutbound = "outbound"

	LevelError = "error"
	LevelWarn  = "warn"
	LevelInfo  = "info"
	LevelDebug = "debug"

	DefaultBodyPreviewLimit = 16 << 10 // 16 KiB
	MaxHeaderValueLen       = 512
	MaxHeaderCount          = 64
)

var sensitiveHeaderNames = map[string]struct{}{
	"authorization":       {},
	"proxy-authorization": {},
	"cookie":              {},
	"set-cookie":          {},
	"x-org-token":         {},
	"x_webhook_signature": {},
	"x-webhook-signature": {},
	"x-api-key":           {},
}

var sensitiveQueryKeys = map[string]struct{}{
	"client_secret": {},
	"password":      {},
	"token":         {},
	"access_token":  {},
	"refresh_token": {},
	"api_key":       {},
	"apikey":        {},
	"secret":        {},
}

// LevelFromStatus maps an HTTP status to a log level.
func LevelFromStatus(status int) string {
	switch {
	case status <= 0:
		return LevelInfo
	case status >= 500:
		return LevelError
	case status >= 400:
		return LevelWarn
	default:
		return LevelInfo
	}
}

// TruncateBody returns a UTF-8-safe preview capped at limit bytes.
func TruncateBody(body []byte, limit int) string {
	if limit <= 0 {
		limit = DefaultBodyPreviewLimit
	}
	if len(body) == 0 {
		return ""
	}
	if len(body) > limit {
		body = body[:limit]
	}
	if !utf8.Valid(body) {
		// Drop incomplete trailing rune.
		for len(body) > 0 && !utf8.Valid(body) {
			body = body[:len(body)-1]
		}
	}
	return string(body)
}

// HashBody returns a hex SHA-256 of the raw body (empty string when empty).
func HashBody(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// SanitizeHeaders redacts secrets and caps size for storage.
func SanitizeHeaders(h http.Header) map[string]string {
	if h == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(h))
	count := 0
	for name, values := range h {
		if count >= MaxHeaderCount {
			break
		}
		key := strings.TrimSpace(name)
		if key == "" {
			continue
		}
		lower := strings.ToLower(key)
		joined := strings.Join(values, ", ")
		if _, sensitive := sensitiveHeaderNames[lower]; sensitive {
			out[key] = "[REDACTED]"
		} else {
			out[key] = truncateString(joined, MaxHeaderValueLen)
		}
		count++
	}
	return out
}

// SanitizeURL redacts sensitive query parameters from a URL string.
func SanitizeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return truncateString(raw, 512)
	}
	q := u.Query()
	changed := false
	for k := range q {
		if _, ok := sensitiveQueryKeys[strings.ToLower(k)]; ok {
			q.Set(k, "[REDACTED]")
			changed = true
		}
	}
	if changed {
		u.RawQuery = q.Encode()
	}
	return truncateString(u.String(), 1024)
}

// HeadersJSON marshals sanitized headers to JSON (never fails; returns {}).
func HeadersJSON(h http.Header) json.RawMessage {
	b, err := json.Marshal(SanitizeHeaders(h))
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return b
}

// MapHeadersJSON marshals an already-sanitized map.
func MapHeadersJSON(m map[string]string) json.RawMessage {
	if m == nil {
		m = map[string]string{}
	}
	b, err := json.Marshal(m)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return b
}

func truncateString(s string, limit int) string {
	if limit <= 0 || len(s) <= limit {
		return s
	}
	s = s[:limit]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s
}
