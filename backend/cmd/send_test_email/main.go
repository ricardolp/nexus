package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
)

func main() {
	_ = godotenv.Load()

	to := flag.String("to", "ricardo.pinheiro@novaconsulting.com.br", "recipient")
	subject := flag.String("subject", "Nexus — teste Resend", "subject")
	flag.Parse()

	sender, kind := mailer.Resolve(mailer.ResolveInput{
		ResendAPIKey:     os.Getenv("RESEND_API_KEY"),
		MailtrapAPIToken: os.Getenv("MAILTRAP_API_TOKEN"),
		MailtrapInboxID:  os.Getenv("MAILTRAP_INBOX_ID"),
		SMTP: mailer.SMTPConfig{
			Host:     os.Getenv("SMTP_HOST"),
			Port:     587,
			Username: firstNonEmpty(os.Getenv("SMTP_USERNAME"), os.Getenv("SMTP_USER")),
			Password: firstNonEmpty(os.Getenv("SMTP_PASSWORD"), os.Getenv("SMTP_PASS")),
			From:     os.Getenv("SMTP_FROM"),
		},
	})
	if sender == nil {
		fmt.Fprintln(os.Stderr, "no mailer configured: set RESEND_API_KEY (preferred), MAILTRAP_API_TOKEN or SMTP_HOST")
		os.Exit(2)
	}

	fromRaw := strings.TrimSpace(os.Getenv("RESEND_FROM"))
	if fromRaw == "" && kind == "resend" {
		fromRaw = "Nexus <onboarding@resend.dev>"
	}
	if fromRaw == "" {
		fromRaw = strings.TrimSpace(os.Getenv("SMTP_FROM"))
	}
	if fromRaw == "" {
		fromRaw = "Nexus <onboarding@resend.dev>"
	}

	appURL := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_APP_URL")), "/")
	if appURL == "" {
		appURL = "https://qas.nexus.novaconsulting.com.br"
	}

	from, err := mailer.ParseFrom(fromRaw)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	htmlBody, err := mailer.RenderLayout(mailer.LayoutInput{
		Preheader:  "Teste de entrega transacional do Nexus via Resend.",
		Title:      "E-mail de teste",
		Greeting:   "Olá,",
		Paragraphs: []string{
			"Este é um disparo de teste do mailer do Nexus.",
			"Se você recebeu esta mensagem, a API do Resend está autenticada e entregando a partir deste ambiente (" + kind + ").",
		},
		CTALabel:   "Abrir o Nexus",
		CTAURL:     appURL,
		HelperText: "Mensagem gerada por cmd/send_test_email. Pode ignorar se não esperava este e-mail.",
		Footer:     "Mensagem enviada pelo Nexus.",
		LogoURL:    mailer.LogoURL(appURL),
		AppURL:     appURL,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "layout:", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := sender.Send(ctx, mailer.Message{
		From:      from,
		To:        []string{*to},
		Subject:   *subject,
		PlainBody: "Este é um disparo de teste do mailer do Nexus (" + kind + ").\n" + appURL + "\n",
		HTMLBody:  htmlBody,
	}); err != nil {
		fmt.Fprintln(os.Stderr, "send:", err)
		os.Exit(1)
	}
	fmt.Println("test_email_sent", "mailer="+kind, "to="+*to)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
