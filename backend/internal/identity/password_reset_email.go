package identity

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
)

type PasswordResetMailInput struct {
	Email     string
	Token     string
	ExpiresAt time.Time
}

func ParsePasswordResetEvent(payload []byte) (PasswordResetMailInput, error) {
	var envelope messaging.CloudEvent
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return PasswordResetMailInput{}, fmt.Errorf("password reset event envelope: %w", err)
	}
	var data struct {
		Email     string    `json:"email"`
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		return PasswordResetMailInput{}, fmt.Errorf("password reset event data: %w", err)
	}
	if strings.TrimSpace(data.Email) == "" || strings.TrimSpace(data.Token) == "" {
		return PasswordResetMailInput{}, fmt.Errorf("password reset event is missing email or token")
	}
	return PasswordResetMailInput{
		Email: data.Email, Token: data.Token, ExpiresAt: data.ExpiresAt,
	}, nil
}

func PasswordResetURL(publicAppURL, token string) string {
	base := strings.TrimRight(strings.TrimSpace(publicAppURL), "/")
	if base == "" {
		base = "http://localhost:5173"
	}
	return base + "/reset-password?token=" + url.QueryEscape(token)
}

func BuildPasswordResetMessage(fromRaw, publicAppURL string, in PasswordResetMailInput) (mailer.Message, error) {
	parsedFrom, err := mailer.ParseFrom(fromRaw)
	if err != nil {
		return mailer.Message{}, err
	}
	link := PasswordResetURL(publicAppURL, in.Token)
	expires := formatBrasilia(in.ExpiresAt)
	htmlBody, err := mailer.RenderLayout(mailer.LayoutInput{
		Preheader:  "Redefina sua senha do Nexus.",
		Title:      "Redefinição de senha",
		Greeting:   "Olá,",
		Paragraphs: []string{
			"Recebemos um pedido para redefinir a senha da conta " + in.Email + ".",
			"Se você não fez este pedido, ignore este e-mail.",
		},
		CTALabel:   "Redefinir senha",
		CTAURL:     link,
		HelperText: "Este link expira em " + expires + " (horário de Brasília).",
		Footer:     "Mensagem enviada pelo Nexus.",
		LogoURL:    mailer.LogoURL(publicAppURL),
		AppURL:     strings.TrimRight(strings.TrimSpace(publicAppURL), "/"),
	})
	if err != nil {
		return mailer.Message{}, err
	}
	plain := fmt.Sprintf(
		"Olá,\n\nRecebemos um pedido para redefinir a senha da conta %s.\n\nRedefinir senha:\n%s\n\nEste link expira em %s (horário de Brasília).\n",
		in.Email, link, expires,
	)
	return mailer.Message{
		From: parsedFrom, To: []string{in.Email}, Subject: "Redefinição de senha — Nexus",
		PlainBody: plain, HTMLBody: htmlBody,
	}, nil
}
