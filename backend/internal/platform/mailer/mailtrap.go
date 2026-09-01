package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type MailtrapConfig struct {
	APIToken string
	InboxID  string
	Endpoint string
}

type MailtrapSender struct {
	token      string
	endpoint   string
	httpClient *http.Client
}

func NewMailtrapSender(cfg MailtrapConfig) *MailtrapSender {
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" {
		endpoint = "https://send.api.mailtrap.io/api/send"
		if id := strings.TrimSpace(cfg.InboxID); id != "" {
			endpoint = "https://sandbox.api.mailtrap.io/api/send/" + id
		}
	}
	return &MailtrapSender{
		token:    strings.TrimSpace(cfg.APIToken),
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (s *MailtrapSender) Send(ctx context.Context, msg Message) error {
	if s.token == "" {
		return fmt.Errorf("mailtrap: API token is required")
	}
	body := mailtrapPayload(msg)
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Api-Token", s.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "nexus-outbox-relay/1.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("mailtrap send: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("mailtrap send: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

type mailtrapAddress struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

func mailtrapPayload(msg Message) map[string]any {
	from := mailtrapAddress{Email: msg.From.Address, Name: msg.From.Name}
	to := make([]mailtrapAddress, 0, len(msg.To))
	for _, addr := range msg.To {
		to = append(to, mailtrapAddress{Email: addr})
	}
	payload := map[string]any{
		"from":    from,
		"to":      to,
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
