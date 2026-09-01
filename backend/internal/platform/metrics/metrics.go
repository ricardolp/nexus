package metrics

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	registry = prometheus.NewRegistry()
	registerOnce sync.Once

	httpRequests = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "nexus_http_requests_total",
			Help: "HTTP requests handled by Nexus APIs.",
		},
		[]string{"service", "method", "route", "status"},
	)
	httpDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "nexus_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		},
		[]string{"service", "method", "route", "status"},
	)
)

func register() {
	registerOnce.Do(func() {
		registry.MustRegister(
			httpRequests,
			httpDuration,
			collectors.NewGoCollector(),
			collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		)
	})
}

// Start exposes /metrics and /health on addr. Returns nil when addr is empty
// so local multi-process runs do not collide on a shared port.
func Start(addr string, logger *slog.Logger) *http.Server {
	if addr == "" {
		return nil
	}
	register()
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if logger != nil {
			logger.Info("metrics listening", "addr", addr)
		}
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			if logger != nil {
				logger.Error("metrics server", "error", err)
			}
		}
	}()
	return srv
}

func Stop(srv *http.Server) {
	if srv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// HTTP records request count and latency using chi route patterns so UUID
// path segments do not explode Prometheus cardinality.
func HTTP(service string) func(http.Handler) http.Handler {
	register()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)

			route := "unmatched"
			if rc := chi.RouteContext(r.Context()); rc != nil {
				if pat := rc.RoutePattern(); pat != "" {
					route = pat
				}
			}
			status := strconv.Itoa(rw.status)
			httpRequests.WithLabelValues(service, r.Method, route, status).Inc()
			httpDuration.WithLabelValues(service, r.Method, route, status).Observe(time.Since(start).Seconds())
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
