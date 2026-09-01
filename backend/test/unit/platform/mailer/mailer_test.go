package mailer_test

import (
	"context"
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
