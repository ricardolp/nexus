package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/config"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/broker"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
	"github.com/nexus/fiscal-messaging/internal/webhook"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	bus, err := broker.Resolve(cfg.BrokerBackend, cfg.RabbitMQURL, logger)
	if err != nil {
		logger.Error("broker", "error", err)
		os.Exit(1)
	}
	defer bus.Close()
	hooks := webhook.NewService(pool)
	invites := resolveInviteSender(cfg)
	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)

	logger.Info("outbox_relay started", "broker", cfg.BrokerBackend, "mailer", inviteSenderKind(cfg))
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("outbox_relay stopping")
			return
		case <-ticker.C:
			n, err := publishBatch(ctx, pool, bus, hooks, inviteMailer{
				sender:       invites,
				from:         cfg.SMTPFrom,
				publicAppURL: cfg.PublicAppURL,
				logger:       logger,
			})
			if err != nil {
				logger.Error("publish_batch", "error", err)
				continue
			}
			if n > 0 {
				logger.Info("published_events", "count", n)
			}
		}
	}
}

type inviteMailer struct {
	sender       mailer.Sender
	from         string
	publicAppURL string
	logger       *slog.Logger
}

func resolveInviteSender(cfg config.Config) mailer.Sender {
	if cfg.MailtrapAPIToken != "" {
		return mailer.NewMailtrapSender(mailer.MailtrapConfig{
			APIToken: cfg.MailtrapAPIToken,
			InboxID:  cfg.MailtrapInboxID,
		})
	}
	if cfg.SMTPHost != "" {
		return mailer.NewSMTPSender(mailer.SMTPConfig{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUsername,
			Password: cfg.SMTPPassword,
			From:     cfg.SMTPFrom,
		})
	}
	return nil
}

func inviteSenderKind(cfg config.Config) string {
	if cfg.MailtrapAPIToken != "" {
		if cfg.MailtrapInboxID != "" {
			return "mailtrap_sandbox"
		}
		return "mailtrap_send"
	}
	if cfg.SMTPHost != "" {
		return "smtp"
	}
	return "none"
}

func publishBatch(ctx context.Context, pool *db.Pool, bus broker.Publisher, hooks *webhook.Service, invites inviteMailer) (int, error) {
	type publishedEvent struct {
		payload []byte
	}
	var toHook []publishedEvent
	published := 0

	err := pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		events, err := messaging.ClaimPendingOutbox(ctx, tx, 50)
		if err != nil {
			return err
		}
		for _, event := range events {
			if event.EventType == messaging.EventUserInvited {
				if err := deliverInviteEmail(ctx, invites, event.PayloadJSON); err != nil {
					shift := event.AttemptCount
					if shift > 6 {
						shift = 6
					}
					backoff := time.Duration(1<<shift) * time.Second
					if markErr := messaging.MarkFailed(ctx, tx, event.ID, err.Error(), backoff); markErr != nil {
						return markErr
					}
					continue
				}
			}
			if event.EventType == messaging.EventPasswordResetRequested {
				if err := deliverPasswordResetEmail(ctx, invites, event.PayloadJSON); err != nil {
					shift := event.AttemptCount
					if shift > 6 {
						shift = 6
					}
					backoff := time.Duration(1<<shift) * time.Second
					if markErr := messaging.MarkFailed(ctx, tx, event.ID, err.Error(), backoff); markErr != nil {
						return markErr
					}
					continue
				}
			}
			if err := bus.Publish(ctx, event.EventType, event.PayloadJSON); err != nil {
				shift := event.AttemptCount
				if shift > 6 {
					shift = 6
				}
				backoff := time.Duration(1<<shift) * time.Second
				if markErr := messaging.MarkFailed(ctx, tx, event.ID, err.Error(), backoff); markErr != nil {
					return markErr
				}
				continue
			}
			if err := messaging.MarkPublished(ctx, tx, event.ID); err != nil {
				return err
			}
			if strings.HasPrefix(event.EventType, "fiscal.") {
				toHook = append(toHook, publishedEvent{payload: event.PayloadJSON})
			}
			published++
		}
		return nil
	})
	if err != nil {
		return published, err
	}

	for _, item := range toHook {
		if err := enqueueWebhook(ctx, hooks, item.payload); err != nil {
			return published, err
		}
	}
	return published, nil
}

func deliverInviteEmail(ctx context.Context, invites inviteMailer, payload []byte) error {
	in, err := identity.ParseInviteEvent(payload)
	if err != nil {
		return err
	}
	if invites.sender == nil {
		invites.logger.Warn("smtp not configured, skipping invite email", "email", in.Email)
		return nil
	}
	msg, err := identity.BuildInviteMessage(invites.from, invites.publicAppURL, in)
	if err != nil {
		return err
	}
	sendCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := invites.sender.Send(sendCtx, msg); err != nil {
		return err
	}
	invites.logger.Info("invite_email_sent", "email", in.Email)
	return nil
}

func deliverPasswordResetEmail(ctx context.Context, invites inviteMailer, payload []byte) error {
	in, err := identity.ParsePasswordResetEvent(payload)
	if err != nil {
		return err
	}
	if invites.sender == nil {
		invites.logger.Warn("smtp not configured, skipping password reset email", "email", in.Email)
		return nil
	}
	msg, err := identity.BuildPasswordResetMessage(invites.from, invites.publicAppURL, in)
	if err != nil {
		return err
	}
	sendCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := invites.sender.Send(sendCtx, msg); err != nil {
		return err
	}
	invites.logger.Info("password_reset_email_sent", "email", in.Email)
	return nil
}

func enqueueWebhook(ctx context.Context, hooks *webhook.Service, payload []byte) error {
	var envelope messaging.CloudEvent
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return err
	}

	var data map[string]any
	_ = json.Unmarshal(envelope.Data, &data)

	aggregateID := envelope.ID
	if raw, ok := data["document_id"].(string); ok {
		if id, err := uuid.Parse(raw); err == nil {
			aggregateID = id
		}
	}

	return hooks.EnqueueFromDomainEvent(ctx, envelope.OrganizationID, envelope.Type, "organization_documents", aggregateID, map[string]any{
		"event_id":        envelope.ID,
		"event_type":      envelope.Type,
		"organization_id": envelope.OrganizationID,
		"data":            data,
		"time":            envelope.Time,
	})
}
