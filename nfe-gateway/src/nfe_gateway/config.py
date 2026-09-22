from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    rabbitmq_url: str = ""
    rabbitmq_exchange: str = "fiscal.events"

    backend_inbound_url: str = "http://localhost:4001"
    backend_internal_url: str = "http://localhost:4002"
    # /v1/oauth/token lives on cmd/control_plane_api — third URL, separate auth.
    backend_control_plane_url: str = "http://localhost:4000"
    nfe_gateway_service_token: str = ""
    nfe_gateway_credentials_key: str = ""

    storage_backend: str = "local"
    storage_local_path: str = "../backend/data/storage"
    object_storage_prefix: str = "fiscal"
    # Same 32-byte key as Go SECRETS_ENCRYPTION_KEY (AES-256-GCM local store).
    secrets_encryption_key: str = ""
    # Comma-separated previous keys for decrypt rotation (encrypt uses current).
    secrets_encryption_key_previous: str = ""

    distribution_poll_tick_seconds: int = 30
    query_worker_tick_seconds: int = 10
    distribution_default_interval_seconds: int = 3600
    distribution_max_concurrent_sefaz_calls: int = 8

    sefaz_force_homologacao: bool = True
    sefaz_status_interval_seconds: int = 720

    app_env: str = "development"
    log_level: str = "INFO"
    metrics_port: int = 0


def load_settings() -> Settings:
    return Settings()


def encryption_key_bytes(settings: Settings) -> bytes:
    """Match Go config.Load: SECRETS_ENCRYPTION_KEY is base64 of 32 raw bytes."""
    import base64

    raw = (settings.secrets_encryption_key or "").strip()
    if not raw:
        raise ValueError("SECRETS_ENCRYPTION_KEY is required for the local object store")
    try:
        key = base64.b64decode(raw, validate=True)
    except Exception:
        key = raw.encode("utf-8")
    if len(key) != 32:
        raise ValueError(
            "SECRETS_ENCRYPTION_KEY must be base64 of 32 bytes "
            f"(or a raw 32-byte string); got decoded length {len(key)}"
        )
    return key
