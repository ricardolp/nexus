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
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/notification"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/broker"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
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

	store, err := storage.NewLocalStore(cfg.StorageLocalPath, cfg.SecretsEncryptionKey)
	if err != nil {
		logger.Error("storage", "error", err)
		os.Exit(1)
	}

	bus, err := broker.Resolve(cfg.BrokerBackend, cfg.RabbitMQURL, logger)
	if err != nil {
		logger.Error("broker", "error", err)
		os.Exit(1)
	}
	defer bus.Close()

	orgs := organization.NewService(pool)
	docs := fiscal.NewService(pool, store, orgs, cfg.ObjectStoragePrefix)

	var provider fiscal.Provider = fiscal.StubProvider{}
	if cfg.FiscalProvider == "messaging" {
		provider = fiscal.NewMessagingProvider(docs, bus)
	}
	worker := fiscal.NewWorker(pool, docs, provider)

	// The gateway's reply only matters when outbound documents are actually
	// handed off to it — subscribing unconditionally is harmless (an idle
	// queue) and means flipping FISCAL_PROVIDER doesn't need a restart of a
	// *different* process too.
	if err := bus.Subscribe(ctx, messaging.EventDocumentTransmissionResult, func(ctx context.Context, msg broker.Message) error {
		return worker.HandleTransmissionResult(ctx, msg.Payload)
	}); err != nil {
		logger.Error("subscribe_transmission_result", "error", err)
		os.Exit(1)
	}

	queries := fiscal.NewQueryService(pool, orgs, bus)
	queryConsumer := fiscal.NewQueryConsumer(queries, notification.NewService(pool))
	if err := bus.Subscribe(ctx, messaging.EventDocumentQueryResult, func(ctx context.Context, msg broker.Message) error {
		return queryConsumer.HandleQueryResult(ctx, msg.Payload)
	}); err != nil {
		logger.Error("subscribe_query_result", "error", err)
		os.Exit(1)
	}

	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)

	logger.Info("fiscal_worker started", "fiscal_provider", cfg.FiscalProvider)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("fiscal_worker stopping")
			return
		case <-ticker.C:
			n, err := worker.ProcessBatch(ctx, 20)
			if err != nil {
				logger.Error("process_batch", "error", err)
				continue
			}
			if n > 0 {
				logger.Info("processed_documents", "count", n)
			}
		}
	}
}
