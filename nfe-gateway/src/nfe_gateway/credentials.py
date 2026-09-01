"""Per-organization OAuth client-credentials, encrypted at rest.

Why this exists: `POST /v1/inbound/fiscal_documents/nfe` (what the
distribution poller feeds ingested NF-e into) is authenticated exactly like
any ERP would be — a client-credentials JWT tied to one
`organization_api_client`, carrying `organization_id`/`source_system`/
`scopes` claims, requiring the `fiscal_documents:inbound:create` scope — a
narrower scope than the legacy `fiscal_documents:create` (which also grants
outbound), on purpose: a leaked gateway credential should only ever be able
to feed inbound documents in, never submit outbound ones (see
`backend/internal/transport/httpapi/handlers.go:receiveInboundDocument` and
`docs/architecture/07_inbound_api.md`). That is a *different* mechanism from
the static bearer token this service uses for the internal signing-material
endpoint (`internal_api.py` — NFE_GATEWAY_SERVICE_TOKEN, service-to-service,
not tenant-scoped).

Because each `organization_api_client` belongs to exactly one organization,
the gateway needs one client_id/client_secret pair per organization — and
because the backend only ever returns a client's raw secret once, at
creation time (`organization_api_client_credentials.client_secret_hash` is
one-way hashed after that, same as a password), this service has to be
handed that raw secret out-of-band at provisioning time and keep it itself.
Provisioning is a deliberate manual step today (create the API client via
the existing `POST /v1/organizations/{id}/api_clients` endpoint, then run
`python -m nfe_gateway.provision_credentials`), not something this service
can self-service.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken

import asyncpg


class CredentialsError(RuntimeError):
    pass


@dataclass(frozen=True)
class OrganizationCredentials:
    client_id: str
    client_secret: str


class CredentialsStore:
    def __init__(self, pool: asyncpg.Pool, fernet_key: str):
        self._pool = pool
        self._fernet: Fernet | None = None
        if not fernet_key:
            return
        try:
            self._fernet = Fernet(fernet_key.encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise CredentialsError(
                "NFE_GATEWAY_CREDENTIALS_KEY must be a valid Fernet key "
                "(generate one with `python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\"`)"
            ) from exc

    async def get(self, organization_id: UUID) -> OrganizationCredentials | None:
        if self._fernet is None:
            raise CredentialsError("NFE_GATEWAY_CREDENTIALS_KEY is not set")
        row = await self._pool.fetchrow(
            "select client_id, client_secret_encrypted "
            "from nfe_gateway_organization_credentials where organization_id = $1",
            organization_id,
        )
        if row is None:
            return None
        try:
            secret = self._fernet.decrypt(row["client_secret_encrypted"].encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise CredentialsError(
                f"could not decrypt stored credentials for organization {organization_id} — "
                "NFE_GATEWAY_CREDENTIALS_KEY may have changed since they were stored"
            ) from exc
        return OrganizationCredentials(client_id=row["client_id"], client_secret=secret)

    async def put(self, organization_id: UUID, client_id: str, client_secret: str) -> None:
        """Called once per organization by the provisioning step — never by
        the pollers/consumers themselves."""
        if self._fernet is None:
            raise CredentialsError("NFE_GATEWAY_CREDENTIALS_KEY is not set")
        encrypted = self._fernet.encrypt(client_secret.encode("utf-8")).decode("utf-8")
        await self._pool.execute(
            """
            insert into nfe_gateway_organization_credentials (organization_id, client_id, client_secret_encrypted)
            values ($1, $2, $3)
            on conflict (organization_id) do update
                set client_id = excluded.client_id,
                    client_secret_encrypted = excluded.client_secret_encrypted,
                    updated_at = now()
            """,
            organization_id,
            client_id,
            encrypted,
        )
