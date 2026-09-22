package mailer_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
)

func TestParseFrom(t *testing.T) {
	t.Parallel()

	addr, err := mailer.ParseFrom("Nexus <noreply@nexus.app>")
	if err != nil {
		t.Fatal(err)
	}
	if addr.Name != "Nexus" || addr.Address != "noreply@nexus.app" {
		t.Fatalf("%#v", addr)
	}

	named, err := mailer.ParseFrom("Nova Consulting - Nexus <no-reply-my-work@novaconsulting.com.br>")
	if err != nil {
		t.Fatal(err)
	}
	if named.Address != "no-reply-my-work@novaconsulting.com.br" {
		t.Fatalf("%#v", named)
	}

	if _, err := mailer.ParseFrom(""); err == nil {
		t.Fatal("expected error")
	}
}

func TestMessageBytesMultipart(t *testing.T) {
	t.Parallel()

	msg := mailer.Message{
		From:      mail.Address{Name: "Nexus", Address: "noreply@nexus.app"},
		To:        []string{"pessoa@empresa.com"},
		Subject:   "Convite\nBcc: attacker@x.com",
		PlainBody: "texto",
		HTMLBody:  "<p>html</p>",
	}
	raw := string(msg.Bytes())
	if strings.Contains(raw, "\nBcc:") || strings.Contains(raw, "\rBcc:") {
		t.Fatalf("header injection: %s", raw)
	}
	if strings.Contains(raw, "Convite\n") || strings.Contains(raw, "Convite\r") {
		t.Fatalf("subject kept a newline: %s", raw)
	}
	if !strings.Contains(raw, "Content-Type: multipart/alternative") {
		t.Fatalf("missing multipart: %s", raw)
	}
	if !strings.Contains(raw, "texto") || !strings.Contains(raw, "<p>html</p>") {
		t.Fatalf("missing bodies: %s", raw)
	}
}

func TestMailtrapSenderSendsJSON(t *testing.T) {
	t.Parallel()

	var gotAuth, gotBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		gotBody = string(body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	t.Cleanup(server.Close)

	sender := mailer.NewMailtrapSender(mailer.MailtrapConfig{
		APIToken: "test-token",
		Endpoint: server.URL,
	})
	err := sender.Send(context.Background(), mailer.Message{
		From:      mail.Address{Name: "Nexus", Address: "noreply@nexus.app"},
		To:        []string{"pessoa@empresa.com"},
		Subject:   "Convite",
		PlainBody: "texto",
		HTMLBody:  "<p>html</p>",
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer test-token" {
		t.Fatalf("auth=%q", gotAuth)
	}
	if !strings.Contains(gotBody, `"pessoa@empresa.com"`) || !strings.Contains(gotBody, `"Convite"`) {
		t.Fatalf("body=%s", gotBody)
	}
}

func TestResendSenderSendsJSON(t *testing.T) {
	t.Parallel()

	var gotAuth, gotBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		gotBody = string(body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}`))
	}))
	t.Cleanup(server.Close)

	sender := mailer.NewResendSender(mailer.ResendConfig{
		APIKey:   "re_test_key",
		Endpoint: server.URL,
	})
	err := sender.Send(context.Background(), mailer.Message{
		From:      mail.Address{Name: "Nexus", Address: "onboarding@resend.dev"},
		To:        []string{"ricardo.pinheiro@novaconsulting.com.br"},
		Subject:   "Nexus — teste Resend",
		PlainBody: "texto",
		HTMLBody:  "<p>html</p>",
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer re_test_key" {
		t.Fatalf("auth=%q", gotAuth)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(gotBody), &payload); err != nil {
		t.Fatal(err)
	}
	from, _ := payload["from"].(string)
	if from != "Nexus <onboarding@resend.dev>" {
		t.Fatalf("from=%q body=%s", from, gotBody)
	}
	to, _ := payload["to"].([]any)
	if len(to) != 1 || to[0] != "ricardo.pinheiro@novaconsulting.com.br" {
		t.Fatalf("to=%v", payload["to"])
	}
	if payload["text"] != "texto" || payload["html"] != "<p>html</p>" {
		t.Fatalf("bodies=%s", gotBody)
	}
}

func TestResendSenderReportsAPIError(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"You can only send testing emails to your own email address"}`))
	}))
	t.Cleanup(server.Close)

	sender := mailer.NewResendSender(mailer.ResendConfig{
		APIKey:   "re_test_key",
		Endpoint: server.URL,
	})
	err := sender.Send(context.Background(), mailer.Message{
		From: mail.Address{Address: "onboarding@resend.dev"},
		To:   []string{"outra@empresa.com"},
	})
	if err == nil || !strings.Contains(err.Error(), "HTTP 403") {
		t.Fatalf("err=%v", err)
	}
}

func TestResolvePrefersResend(t *testing.T) {
	t.Parallel()

	sender, kind := mailer.Resolve(mailer.ResolveInput{
		ResendAPIKey:     "re_key",
		MailtrapAPIToken: "mt_key",
		SMTP:             mailer.SMTPConfig{Host: "smtp.office365.com"},
	})
	if kind != "resend" {
		t.Fatalf("kind=%q", kind)
	}
	if _, ok := sender.(*mailer.ResendSender); !ok {
		t.Fatalf("%T", sender)
	}

	_, kind = mailer.Resolve(mailer.ResolveInput{
		MailtrapAPIToken: "mt_key",
		MailtrapInboxID:  "inbox-1",
	})
	if kind != "mailtrap_sandbox" {
		t.Fatalf("kind=%q", kind)
	}

	_, kind = mailer.Resolve(mailer.ResolveInput{
		SMTP: mailer.SMTPConfig{Host: "smtp.office365.com"},
	})
	if kind != "smtp" {
		t.Fatalf("kind=%q", kind)
	}

	sender, kind = mailer.Resolve(mailer.ResolveInput{})
	if kind != "none" || sender != nil {
		t.Fatalf("kind=%q sender=%v", kind, sender)
	}
}
