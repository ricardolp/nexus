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

type InviteMailInput struct {
	Email        string
	Token        string
	ExpiresAt    time.Time
	PlatformRole string
}

func ParseInviteEvent(payload []byte) (InviteMailInput, error) {
	var envelope messaging.CloudEvent
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return InviteMailInput{}, fmt.Errorf("invite event envelope: %w", err)
	}
	var data struct {
		Email        string    `json:"email"`
		Token        string    `json:"token"`
		ExpiresAt    time.Time `json:"expires_at"`
		PlatformRole string    `json:"platform_role"`
	}
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		return InviteMailInput{}, fmt.Errorf("invite event data: %w", err)
	}
	if strings.TrimSpace(data.Email) == "" || strings.TrimSpace(data.Token) == "" {
		return InviteMailInput{}, fmt.Errorf("invite event is missing email or token")
	}
	return InviteMailInput{
		Email:        data.Email,
		Token:        data.Token,
		ExpiresAt:    data.ExpiresAt,
		PlatformRole: data.PlatformRole,
	}, nil
}

func InviteAcceptURL(publicAppURL, token string) string {
	base := strings.TrimRight(strings.TrimSpace(publicAppURL), "/")
	if base == "" {
		base = "http://localhost:5173"
	}
	return base + "/invite?token=" + url.QueryEscape(token)
}

func BuildInviteMessage(fromRaw, publicAppURL string, in InviteMailInput) (mailer.Message, error) {
	parsedFrom, err := mailer.ParseFrom(fromRaw)
	if err != nil {
		return mailer.Message{}, err
	}
	link := InviteAcceptURL(publicAppURL, in.Token)
	expires := formatBrasilia(in.ExpiresAt)
	copy := inviteCopy(in)

	htmlBody, err := mailer.RenderLayout(mailer.LayoutInput{
		Preheader:  copy.preheader,
		Title:      copy.title,
		Greeting:   "Olá,",
		Paragraphs: copy.paragraphs,
		CTALabel:   "Criar senha e ativar conta",
		CTAURL:     link,
		HelperText: "Se o botão não funcionar, copie e cole o link abaixo no navegador. Este convite expira em " + expires + " (horário de Brasília).",
		Footer:     "Se você não esperava este e-mail, ignore-o. Mensagem enviada pelo Nexus.",
		LogoURL:    mailer.LogoURL(publicAppURL),
		AppURL:     strings.TrimRight(strings.TrimSpace(publicAppURL), "/"),
	})
	if err != nil {
		return mailer.Message{}, err
	}

	plain := fmt.Sprintf(
		"Olá,\n\n%s\n\n%s\n\nCriar senha e ativar conta:\n%s\n\nEste convite expira em %s (horário de Brasília).\nSe você não esperava este e-mail, ignore-o.\n",
		copy.title, strings.Join(copy.plainParagraphs, "\n\n"), link, expires,
	)

	return mailer.Message{
		From:      parsedFrom,
		To:        []string{in.Email},
		Subject:   copy.subject,
		PlainBody: plain,
		HTMLBody:  htmlBody,
	}, nil
}

type inviteTemplate struct {
	subject         string
	preheader       string
	title           string
	paragraphs      []string
	plainParagraphs []string
}

func inviteCopy(in InviteMailInput) inviteTemplate {
	email := in.Email
	switch in.PlatformRole {
	case PlatformRoleAdmin, PlatformRoleSystem, PlatformRoleSupport:
		return inviteTemplate{
			subject:   "Você foi convidado para a equipe Nexus",
			preheader: "Crie sua senha para acessar o painel da plataforma.",
			title:     "Convite para a equipe da plataforma",
			paragraphs: []string{
				"Você foi convidado para a equipe interna do Nexus com o e-mail " + email + ".",
				"Crie uma senha para ativar sua conta e entrar no painel administrativo.",
			},
			plainParagraphs: []string{
				"Você foi convidado para a equipe interna do Nexus com o e-mail " + email + ".",
				"Crie uma senha para ativar sua conta e entrar no painel administrativo.",
			},
		}
	default:
		return inviteTemplate{
			subject:   "Você foi convidado para o Nexus",
			preheader: "Crie sua senha para acessar a organização.",
			title:     "Convite para acessar o Nexus",
			paragraphs: []string{
				"Você foi convidado para uma organização no Nexus com o e-mail " + email + ".",
				"Crie uma senha para ativar sua conta e começar a usar a mensageria fiscal.",
			},
			plainParagraphs: []string{
				"Você foi convidado para uma organização no Nexus com o e-mail " + email + ".",
				"Crie uma senha para ativar sua conta e começar a usar a mensageria fiscal.",
			},
		}
	}
}

func formatBrasilia(t time.Time) string {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		loc = time.FixedZone("America/Sao_Paulo", -3*60*60)
	}
	if t.IsZero() {
		return ""
	}
	return t.In(loc).Format("02/01/2006 15:04")
}
