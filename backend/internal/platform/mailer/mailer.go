package mailer

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type Message struct {
	From      mail.Address
	To        []string
	Subject   string
	PlainBody string
	HTMLBody  string
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
	for _, to := range msg.To {
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
	fmt.Fprintf(&b, "Subject: %s\r\n", sanitizeHeader(m.Subject))
	fmt.Fprintf(&b, "MIME-Version: 1.0\r\n")
	if m.HTMLBody != "" && m.PlainBody != "" {
		const boundary = "nexus-invite"
		fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary)
		fmt.Fprintf(&b, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", boundary, m.PlainBody)
		fmt.Fprintf(&b, "--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n", boundary, m.HTMLBody)
		fmt.Fprintf(&b, "--%s--\r\n", boundary)
		return []byte(b.String())
	}
	if m.HTMLBody != "" {
		fmt.Fprintf(&b, "Content-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n", m.HTMLBody)
		return []byte(b.String())
	}
	fmt.Fprintf(&b, "Content-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", m.PlainBody)
	return []byte(b.String())
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
