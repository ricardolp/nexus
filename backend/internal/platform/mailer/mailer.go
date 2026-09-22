package mailer

import (
	"context"
	"encoding/base64"
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

type Message struct {
	From        mail.Address
	To          []string
	Cc          []string
	Subject     string
	PlainBody   string
	HTMLBody    string
	Attachments []Attachment
}

type Sender interface {
	Send(ctx context.Context, msg Message) error
}

type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

type SMTPSender struct {
	cfg SMTPConfig
}

func NewSMTPSender(cfg SMTPConfig) *SMTPSender {
	return &SMTPSender{cfg: cfg}
}

func ParseFrom(raw string) (mail.Address, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return mail.Address{}, fmt.Errorf("SMTP_FROM is required")
	}
	addr, err := mail.ParseAddress(raw)
	if err != nil {
		return mail.Address{}, fmt.Errorf("SMTP_FROM: %w", err)
	}
	return *addr, nil
}

func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	from := msg.From.Address
	if from == "" {
		parsed, err := ParseFrom(s.cfg.From)
		if err != nil {
			return err
		}
		msg.From = parsed
		from = parsed.Address
	}
	if len(msg.To) == 0 {
		return fmt.Errorf("mailer: recipient is required")
	}

	addr := net.JoinHostPort(s.cfg.Host, fmt.Sprintf("%d", s.cfg.Port))
	tlsConfig := &tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}
	dialer := &net.Dialer{Timeout: 10 * time.Second}

	var (
		conn net.Conn
		err  error
	)
	if s.cfg.Port == 465 {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	} else {
		_ = conn.SetDeadline(time.Now().Add(20 * time.Second))
	}

	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if s.cfg.Port != 465 {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(tlsConfig); err != nil {
				return fmt.Errorf("smtp starttls: %w", err)
			}
		}
	}
	if s.cfg.Username != "" {
		if err := authenticateSMTP(client, s.cfg); err != nil {
			return err
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	recipients := append([]string{}, msg.To...)
	recipients = append(recipients, msg.Cc...)
	for _, to := range recipients {
		if err := client.Rcpt(to); err != nil {
			return fmt.Errorf("smtp rcpt %s: %w", to, err)
		}
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := writer.Write(msg.Bytes()); err != nil {
		_ = writer.Close()
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("smtp close: %w", err)
	}
	return client.Quit()
}

func (m Message) Bytes() []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", m.From.String())
	fmt.Fprintf(&b, "To: %s\r\n", strings.Join(m.To, ", "))
	if len(m.Cc) > 0 {
		fmt.Fprintf(&b, "Cc: %s\r\n", strings.Join(m.Cc, ", "))
	}
	fmt.Fprintf(&b, "Subject: %s\r\n", sanitizeHeader(m.Subject))
	fmt.Fprintf(&b, "MIME-Version: 1.0\r\n")

	body := m.buildBodyPart()
	if len(m.Attachments) == 0 {
		b.WriteString(body)
		return []byte(b.String())
	}

	const mixed = "nexus-mixed"
	fmt.Fprintf(&b, "Content-Type: multipart/mixed; boundary=%s\r\n\r\n", mixed)
	fmt.Fprintf(&b, "--%s\r\n%s", mixed, body)
	for _, att := range m.Attachments {
		if len(att.Data) == 0 {
			continue
		}
		ct := att.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		name := att.Filename
		if name == "" {
			name = "attachment.bin"
		}
		fmt.Fprintf(&b, "--%s\r\nContent-Type: %s\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"%s\"\r\n\r\n",
			mixed, ct, sanitizeHeader(name))
		b.WriteString(base64EncodeLines(att.Data))
		b.WriteString("\r\n")
	}
	fmt.Fprintf(&b, "--%s--\r\n", mixed)
	return []byte(b.String())
}

func (m Message) buildBodyPart() string {
	if m.HTMLBody != "" && m.PlainBody != "" {
		const boundary = "nexus-alt"
		var b strings.Builder
		fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary)
		fmt.Fprintf(&b, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", boundary, m.PlainBody)
		fmt.Fprintf(&b, "--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n", boundary, m.HTMLBody)
		fmt.Fprintf(&b, "--%s--\r\n", boundary)
		return b.String()
	}
	var b strings.Builder
	if m.HTMLBody != "" {
		fmt.Fprintf(&b, "Content-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n", m.HTMLBody)
		return b.String()
	}
	fmt.Fprintf(&b, "Content-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", m.PlainBody)
	return b.String()
}

func base64EncodeLines(data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	const lineLen = 76
	var parts []string
	for i := 0; i < len(encoded); i += lineLen {
		end := i + lineLen
		if end > len(encoded) {
			end = len(encoded)
		}
		parts = append(parts, encoded[i:end])
	}
	return strings.Join(parts, "\r\n")
}

func authenticateSMTP(client *smtp.Client, cfg SMTPConfig) error {
	ok, mechanisms := client.Extension("AUTH")
	if !ok {
		return fmt.Errorf("smtp auth: server does not advertise AUTH")
	}
	upper := strings.ToUpper(mechanisms)
	// Office 365 advertises LOGIN; Mailtrap and many relays advertise PLAIN.
	if strings.Contains(upper, "LOGIN") {
		if err := client.Auth(&loginAuth{username: cfg.Username, password: cfg.Password}); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
		return nil
	}
	if strings.Contains(upper, "PLAIN") {
		if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
		return nil
	}
	return fmt.Errorf("smtp auth: unsupported mechanisms %q", mechanisms)
}

type loginAuth struct {
	username, password string
}

func (a *loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS {
		return "", nil, fmt.Errorf("smtp login requires TLS")
	}
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	challenge := strings.TrimSpace(strings.ToLower(string(fromServer)))
	switch {
	case strings.Contains(challenge, "username"):
		return []byte(a.username), nil
	case strings.Contains(challenge, "password"):
		return []byte(a.password), nil
	default:
		return nil, fmt.Errorf("unexpected SMTP LOGIN challenge %q", fromServer)
	}
}

func sanitizeHeader(value string) string {
	return strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, value)
}
