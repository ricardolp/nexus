package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv                 string
	HTTPAddr               string
	InboundHTTPAddr        string
	InternalHTTPAddr       string
	DatabaseURL            string
	JWTSecret              string
	JWTIssuer              string
	JWTAccessTTL           time.Duration
	JWTClientTTL           time.Duration
	StorageBackend         string
	StorageLocalPath       string
	BrokerBackend          string
	RabbitMQURL            string
	ObjectStoragePrefix    string
	AzureKeyVaultURL       string
	CertLocalPath          string
	SecretsEncryptionKey   []byte
	NFEGatewayServiceToken string
	FiscalProvider         string
	SMTPHost               string
	SMTPPort               int
	SMTPUsername           string
	SMTPPassword           string
	SMTPFrom               string
	PublicAppURL           string
	ResendAPIKey           string
	MailtrapAPIToken       string
	MailtrapInboxID        string
	// InternalAPIAllowedCIDRs, when non-empty, restricts internal_api to
	// these source ranges (httpx.IPAllowlist) — empty means "use
	// httpx.DefaultInternalCIDRs", not "no restriction". Comma-separated
	// via INTERNAL_API_ALLOWED_CIDRS.
	InternalAPIAllowedCIDRs []string
	// InternalAPITLSCertFile / InternalAPITLSKeyFile enable HTTPS on internal_api.
	// InternalAPITLSClientCAFile, when set, requires client certs (mTLS) signed by that CA.
	InternalAPITLSCertFile     string
	InternalAPITLSKeyFile      string
	InternalAPITLSClientCAFile string
	// SecretsEncryptionKeyPrevious holds prior AES keys (base64, comma-separated)
	// for decrypt-side rotation of encrypted secrets / local object store.
	SecretsEncryptionKeyPrevious [][]byte
	// MetricsAddr is the scrape listen address for Prometheus (e.g. ":9090").
	// Empty means the process does not open a metrics server — required so
	// local multi-binary runs do not collide on a shared port.
	MetricsAddr string
	// LLM_* configure OpenAI-compatible chat for NFS-e classification suggestions.
	// When LLMAPIKey is empty the feature is disabled (handlers return 503).
	LLMAPIKey  string
	LLMBaseURL string
	LLMModel   string
}

func Load() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		AppEnv:                     getenv("APP_ENV", "development"),
		HTTPAddr:                   getenv("HTTP_ADDR", ":4000"),
		InboundHTTPAddr:            getenv("INBOUND_HTTP_ADDR", ":4001"),
		InternalHTTPAddr:           getenv("INTERNAL_HTTP_ADDR", ":4002"),
		DatabaseURL:                getenv("DATABASE_URL", ""),
		JWTSecret:                  getenv("JWT_SECRET", ""),
		JWTIssuer:                  getenv("JWT_ISSUER", "fiscal-messaging"),
		JWTAccessTTL:               minutesEnv("JWT_ACCESS_TTL_MINUTES", 15),
		JWTClientTTL:               minutesEnv("JWT_CLIENT_TTL_MINUTES", 60),
		StorageBackend:             getenv("STORAGE_BACKEND", "local"),
		StorageLocalPath:           getenv("STORAGE_LOCAL_PATH", "./data/storage"),
		BrokerBackend:              getenv("BROKER_BACKEND", "memory"),
		RabbitMQURL:                getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		ObjectStoragePrefix:        getenv("OBJECT_STORAGE_PREFIX", "fiscal"),
		AzureKeyVaultURL:           getenv("AZURE_KEY_VAULT_URL", ""),
		CertLocalPath:              getenv("CERT_LOCAL_PATH", "./data/certificates"),
		NFEGatewayServiceToken:     getenv("NFE_GATEWAY_SERVICE_TOKEN", ""),
		FiscalProvider:             getenv("FISCAL_PROVIDER", "stub"),
		SMTPHost:                   getenv("SMTP_HOST", ""),
		SMTPPort:                   intEnv("SMTP_PORT", 587),
		SMTPUsername:               getenvAny("", "SMTP_USERNAME", "SMTP_USER"),
		SMTPPassword:               getenvAny("", "SMTP_PASSWORD", "SMTP_PASS"),
		SMTPFrom:                   getenv("SMTP_FROM", "Nexus <noreply@nexus.app>"),
		PublicAppURL:               publicAppURL(),
		ResendAPIKey:               getenv("RESEND_API_KEY", ""),
		MailtrapAPIToken:           getenv("MAILTRAP_API_TOKEN", ""),
		MailtrapInboxID:            getenv("MAILTRAP_INBOX_ID", ""),
		InternalAPIAllowedCIDRs:    splitCSV(getenv("INTERNAL_API_ALLOWED_CIDRS", "")),
		InternalAPITLSCertFile:     getenv("INTERNAL_API_TLS_CERT_FILE", ""),
		InternalAPITLSKeyFile:      getenv("INTERNAL_API_TLS_KEY_FILE", ""),
		InternalAPITLSClientCAFile: getenv("INTERNAL_API_TLS_CLIENT_CA_FILE", ""),
		MetricsAddr:                metricsAddr(),
		LLMAPIKey:                  getenv("LLM_API_KEY", ""),
		LLMBaseURL:                 getenv("LLM_API_BASE_URL", "https://api.openai.com"),
		LLMModel:                   getenv("LLM_MODEL", "gpt-4.1-mini"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}

	if raw := getenv("SECRETS_ENCRYPTION_KEY", ""); raw != "" {
		key, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			return Config{}, fmt.Errorf("SECRETS_ENCRYPTION_KEY must be base64: %w", err)
		}
		if len(key) != 32 {
			return Config{}, fmt.Errorf("SECRETS_ENCRYPTION_KEY must decode to 32 bytes, got %d", len(key))
		}
		cfg.SecretsEncryptionKey = key
	}
	for _, part := range splitCSV(getenv("SECRETS_ENCRYPTION_KEY_PREVIOUS", "")) {
		key, err := base64.StdEncoding.DecodeString(part)
		if err != nil {
			return Config{}, fmt.Errorf("SECRETS_ENCRYPTION_KEY_PREVIOUS entry must be base64: %w", err)
		}
		if len(key) != 32 {
			return Config{}, fmt.Errorf("SECRETS_ENCRYPTION_KEY_PREVIOUS entry must decode to 32 bytes, got %d", len(key))
		}
		cfg.SecretsEncryptionKeyPrevious = append(cfg.SecretsEncryptionKeyPrevious, key)
	}

	return cfg, nil
}

func metricsAddr() string {
	if v := getenv("METRICS_ADDR", ""); v != "" {
		return v
	}
	if port := getenv("METRICS_PORT", ""); port != "" {
		if strings.HasPrefix(port, ":") {
			return port
		}
		return ":" + port
	}
	return ""
}

// ListenAddr prefers Railway/Heroku's PORT when set, otherwise the
// process-specific address from env (HTTP_ADDR / INBOUND_HTTP_ADDR / …).
func ListenAddr(preferred string) string {
	if port := os.Getenv("PORT"); port != "" {
		if strings.HasPrefix(port, ":") {
			return port
		}
		return ":" + port
	}
	return preferred
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvAny(fallback string, keys ...string) string {
	for _, key := range keys {
		if v := os.Getenv(key); v != "" {
			return v
		}
	}
	return fallback
}

func minutesEnv(key string, fallback int) time.Duration {
	return time.Duration(intEnv(key, fallback)) * time.Minute
}

func intEnv(key string, fallback int) int {
	raw := getenv(key, strconv.Itoa(fallback))
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func publicAppURL() string {
	if v := getenv("PUBLIC_APP_URL", ""); v != "" {
		return strings.TrimRight(v, "/")
	}
	if host := getenv("RAILWAY_SERVICE_FRONTEND_URL", ""); host != "" {
		if strings.HasPrefix(host, "http://") || strings.HasPrefix(host, "https://") {
			return strings.TrimRight(host, "/")
		}
		return "https://" + strings.TrimRight(host, "/")
	}
	return "http://localhost:5173"
}

func splitCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
