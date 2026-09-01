from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    rabbitmq_url: str = ""
    rabbitmq_exchange: str = "fiscal.events"

    backend_inbound_url: str = "http://localhost:4001"
    backend_internal_url: str = "http://localhost:4002"
    # /v1/oauth/token lives on cmd/control_plane_api, not inbound_api or
    # internal_api — see oauth.py / credentials.py for why this is a third,
    # separate URL and a separate auth mechanism from the other two.
    backend_control_plane_url: str = "http://localhost:4000"
    nfe_gateway_service_token: str = ""
    nfe_gateway_credentials_key: str = ""

    storage_backend: str = "local"
    storage_local_path: str = "../backend/data/storage"
    object_storage_prefix: str = "fiscal"

    distribution_poll_tick_seconds: int = 30
    # How often workers/query_worker.py sweeps fiscal_document_query_requests
    # for pending/processing rows. Short on purpose — the user is waiting on
    # an in-app notification, not a background report — but each tick is
    # cheap (a SELECT ... FOR UPDATE SKIP LOCKED, no SEFAZ call unless work
    # is actually claimed).
    query_worker_tick_seconds: int = 10
    # decide_next_poll() floors this to 3600s regardless (see
    # distribution_state.py's module docstring — SEFAZ requires >=1h after a
    # cStat 137) — default matches that floor so the config isn't misleading.
    distribution_default_interval_seconds: int = 3600
    distribution_max_concurrent_sefaz_calls: int = 8

    # Safety override for SEFAZ calls — see sefaz/environment.py. True means
    # every call goes to homologação no matter what a company record says;
    # only flip to false once deliberately ready to transmit for real.
    sefaz_force_homologacao: bool = True

    app_env: str = "development"
    log_level: str = "INFO"
    # Prometheus scrape port. 0 keeps the endpoint off so local workers
    # sharing a machine do not collide. Railway sets METRICS_PORT=9090.
    metrics_port: int = 0


def load_settings() -> Settings:
    return Settings()
