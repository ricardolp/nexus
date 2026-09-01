package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nexus/fiscal-messaging/internal/config"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

// inbound_orchestrator_worker drives execution plan steps configured as
// AUTO (spec §9): it never decides business outcomes itself — it just calls
// the same Service.AdvanceStep used by the manual "advance" HTTP endpoint,
// for whichever steps are READY and don't require a human.
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

	store, err := storage.NewLocalStore(cfg.StorageLocalPath, cfg.SecretsEncryptionKey)
	if err != nil {
		logger.Error("storage", "error", err)
		os.Exit(1)
	}

	if len(cfg.SecretsEncryptionKey) == 0 {
		logger.Warn("SECRETS_ENCRYPTION_KEY not set — SAP integrations with a stored client_secret cannot be resolved (falling back to stub)")
	}

	orgs := organization.NewService(pool)
	fiscalSvc := fiscal.NewService(pool, store, orgs, cfg.ObjectStoragePrefix)
	integrations := integration.NewService(pool, cfg.SecretsEncryptionKey)
	svc := inbound.NewService(pool, fiscalSvc, orgs, integrations)
	worker := inbound.NewWorker(svc)

	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)

	logger.Info("inbound_orchestrator_worker started")
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("inbound_orchestrator_worker stopping")
			return
		case <-ticker.C:
			n, err := worker.ProcessBatch(ctx, 20)
			if err != nil {
				logger.Error("process_batch", "error", err)
				continue
			}
			if n > 0 {
				logger.Info("processed_steps", "count", n)
			}
		}
	}
}
