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
	"github.com/nexus/fiscal-messaging/internal/billing"
	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/config"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/inbound"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/notification"
	"github.com/nexus/fiscal-messaging/internal/ops"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/broker"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
	"github.com/nexus/fiscal-messaging/internal/platform/keyvault"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
	"github.com/nexus/fiscal-messaging/internal/support"
	"github.com/nexus/fiscal-messaging/internal/transport/httpapi"
	"github.com/nexus/fiscal-messaging/internal/webhook"
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

	certStore, err := keyvault.Resolve(cfg.AzureKeyVaultURL, cfg.CertLocalPath, cfg.SecretsEncryptionKey, logger)
	if err != nil {
		logger.Error("key_vault", "error", err)
		os.Exit(1)
	}

	store, err := storage.NewLocalStore(cfg.StorageLocalPath, cfg.SecretsEncryptionKey)
	if err != nil {
		logger.Error("storage", "error", err)
		os.Exit(1)
	}

	if len(cfg.SecretsEncryptionKey) == 0 {
		logger.Warn("SECRETS_ENCRYPTION_KEY not set — integration endpoints storing a client_secret will respond 503")
	}

	bus, err := broker.Resolve(cfg.BrokerBackend, cfg.RabbitMQURL, logger)
	if err != nil {
		logger.Error("broker", "error", err)
		os.Exit(1)
	}
	defer bus.Close()

	tokens := auth.NewTokenService(cfg.JWTSecret, cfg.JWTIssuer, cfg.JWTAccessTTL, cfg.JWTClientTTL)
	orgs := organization.NewService(pool)
	fiscalSvc := fiscal.NewService(pool, store, orgs, cfg.ObjectStoragePrefix)
	integrations := integration.NewService(pool, cfg.SecretsEncryptionKey)
	identitySvc := identity.NewService(pool)
	identitySvc.Configure(cfg.SecretsEncryptionKey, store)
	api := &httpapi.ControlPlane{
		Identity:         identitySvc,
		Orgs:             orgs,
		Ops:              ops.NewService(pool),
		Webhooks:         webhook.NewService(pool),
		Certificates:     certificate.NewService(pool, certStore),
		Notifications:    notification.NewService(pool),
		Inbound:          inbound.NewService(pool, fiscalSvc, orgs, integrations),
		Integrations:     integrations,
		Fiscal:           fiscalSvc,
		FiscalQueries:    fiscal.NewQueryService(pool, orgs, bus),
		PendingDocuments: fiscal.NewPendingDocumentService(pool, orgs),
		Support:          support.NewService(pool, store, cfg.AppEnv),
		Billing:          billing.NewService(pool, orgs),
		Tokens:           tokens,
	}

	r := chi.NewRouter()
	r.Use(chimw.Recoverer)
	r.Use(httpx.CORS)
	r.Use(httpx.RequestContext)
	r.Use(httpx.LimitBody(6 << 20))
	r.Use(metrics.HTTP("control_plane_api"))
	r.Use(httpx.AccessLog(logger))
	r.Mount("/", api.Routes())

	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)

	addr := config.ListenAddr(cfg.HTTPAddr)
	server := &http.Server{Addr: addr, Handler: r}
	go func() {
		logger.Info("control_plane_api listening", "addr", addr)
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
