package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/nexus/fiscal-messaging/internal/config"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
	"github.com/nexus/fiscal-messaging/internal/transport/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("config", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
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

	tokens := auth.NewTokenService(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAccessTTL, cfg.JWTClientTTL)
	orgs := organization.NewService(pool)
	fiscalSvc := fiscal.NewService(pool, store, orgs, cfg.ObjectStoragePrefix)
	integrations := integration.NewService(pool, cfg.SecretsEncryptionKey)
	api := &httpapi.InboundAPI{
		Fiscal:  fiscalSvc,
		Inbound: inbound.NewService(pool, fiscalSvc, orgs, integrations),
		Orgs:    orgs,
		Tokens:  tokens,
	}

	r := chi.NewRouter()
	r.Use(chimw.Recoverer)
	r.Use(httpx.CORS)
	r.Use(httpx.RequestContext)
	r.Use(httpx.LimitBody(httpx.DefaultMaxBodyBytes))
	r.Use(metrics.HTTP("inbound_api"))
	r.Use(httpx.AccessLog(logger))
	r.Mount("/", api.Routes())

	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)

	addr := config.ListenAddr(cfg.InboundHTTPAddr)
	server := &http.Server{Addr: addr, Handler: r}
	go func() {
		logger.Info("inbound_api listening", "addr", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
