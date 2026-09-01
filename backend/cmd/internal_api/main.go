// internal_api serves service-to-service endpoints only — today just
// certificate signing-material for the nfe-gateway (see
// docs/architecture/22_nfe_gateway_service.md). It listens on its own port
// (InternalHTTPAddr) so it can be firewalled off from the public internet
// independently of control_plane_api/inbound_api in deployment.
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
	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/config"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
	"github.com/nexus/fiscal-messaging/internal/platform/keyvault"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
	"github.com/nexus/fiscal-messaging/internal/transport/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("config", "error", err)
		os.Exit(1)
	}
	if cfg.NFEGatewayServiceToken == "" {
		logger.Warn("NFE_GATEWAY_SERVICE_TOKEN not set — internal_api will reject every request with 503")
	}
	allowedCIDRs := cfg.InternalAPIAllowedCIDRs
	if len(allowedCIDRs) == 0 {
		allowedCIDRs = httpx.DefaultInternalCIDRs
	}
	logger.Info("internal_api ip allowlist", "cidrs", allowedCIDRs)

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

	api := &httpapi.InternalAPI{
		Certificates: certificate.NewService(pool, certStore),
		ServiceToken: cfg.NFEGatewayServiceToken,
	}

	r := chi.NewRouter()
	r.Use(chimw.Recoverer)
	r.Use(httpx.RequestContext)
	// /health stays outside the source-IP allowlist so Railway's probe
	// (which does not come from the private-network CIDR) can still see
	// the process. The signing-material routes below remain restricted.
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Group(func(r chi.Router) {
		r.Use(httpx.IPAllowlist(allowedCIDRs))
		r.Use(httpx.LimitBody(httpx.DefaultMaxBodyBytes))
		r.Use(metrics.HTTP("internal_api"))
		r.Use(httpx.AccessLog(logger))
		r.Mount("/", api.Routes())
	})

	metricsSrv := metrics.Start(cfg.MetricsAddr, logger)
	defer metrics.Stop(metricsSrv)

	addr := config.ListenAddr(cfg.InternalHTTPAddr)
	server := &http.Server{Addr: addr, Handler: r}
	go func() {
		logger.Info("internal_api listening", "addr", addr)
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
