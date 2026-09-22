package mailer

import "strings"

type ResolveInput struct {
	ResendAPIKey     string
	MailtrapAPIToken string
	MailtrapInboxID  string
	SMTP             SMTPConfig
}

func Resolve(in ResolveInput) (Sender, string) {
	if key := strings.TrimSpace(in.ResendAPIKey); key != "" {
		return NewResendSender(ResendConfig{APIKey: key}), "resend"
	}
	if token := strings.TrimSpace(in.MailtrapAPIToken); token != "" {
		sender := NewMailtrapSender(MailtrapConfig{
			APIToken: token,
			InboxID:  in.MailtrapInboxID,
		})
		if strings.TrimSpace(in.MailtrapInboxID) != "" {
			return sender, "mailtrap_sandbox"
		}
		return sender, "mailtrap_send"
	}
	if strings.TrimSpace(in.SMTP.Host) != "" {
		return NewSMTPSender(in.SMTP), "smtp"
	}
	return nil, "none"
}
