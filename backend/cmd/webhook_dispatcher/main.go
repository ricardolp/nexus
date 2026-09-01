package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nexus/fiscal-messaging/internal/config"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
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

	hooks := webhook.NewService(pool)
	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)
	logger.Info("webhook_dispatcher started")

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("webhook_dispatcher stopping")
			return
		case <-ticker.C:
			n, err := hooks.ProcessDueDeliveries(ctx, 50)
			if err != nil {
				logger.Error("process_deliveries", "error", err)
				continue
			}
			if n > 0 {
				logger.Info("delivered_webhooks", "count", n)
			}
		}
	}
}
