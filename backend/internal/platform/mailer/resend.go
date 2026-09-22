package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

const resendSendURL = "https://api.resend.com/emails"

type ResendConfig struct {
	APIKey   string
	Endpoint string
}

type ResendSender struct {
	apiKey     string
	endpoint   string
	httpClient *http.Client
}

func NewResendSender(cfg ResendConfig) *ResendSender {
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" {
		endpoint = resendSendURL
	}
	return &ResendSender{
		apiKey:   strings.TrimSpace(cfg.APIKey),
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (s *ResendSender) Send(ctx context.Context, msg Message) error {
	if s.apiKey == "" {
		return fmt.Errorf("resend: API key is required")
	}
	if len(msg.To) == 0 {
		return fmt.Errorf("resend: recipient is required")
	}
	raw, err := json.Marshal(resendPayload(msg))
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "nexus-outbox-relay/1.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resend send: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend send: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

func resendPayload(msg Message) map[string]any {
	payload := map[string]any{
		"from":    formatResendFrom(msg.From),
		"to":      append([]string(nil), msg.To...),
		"subject": msg.Subject,
	}
	if msg.PlainBody != "" {
		payload["text"] = msg.PlainBody
	}
	if msg.HTMLBody != "" {
		payload["html"] = msg.HTMLBody
	}
	return payload
}

func formatResendFrom(from mail.Address) string {
	name := strings.TrimSpace(from.Name)
	if name == "" {
		return from.Address
	}
	return name + " <" + from.Address + ">"
}
