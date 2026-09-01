"""OAuth2 client-credentials token cache for the backend's inbound_api —
one token per organization, refreshed shortly before it expires. See
credentials.py's module docstring for why this exists as a separate
mechanism from the internal_api's static service token.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx

# Go's time.Time JSON marshaling emits up to 9 fractional-second digits;
# Python's datetime.fromisoformat (< 3.11) only accepts up to 6. Truncate
# rather than depend on a Python version we don't control in production.
_EXCESS_FRACTIONAL_SECONDS = re.compile(r"(\.\d{6})\d+")


def _parse_backend_timestamp(value: str) -> datetime:
    value = value.replace("Z", "+00:00")
    value = _EXCESS_FRACTIONAL_SECONDS.sub(r"\1", value)
    return datetime.fromisoformat(value)

from nfe_gateway.credentials import CredentialsError, CredentialsStore, OrganizationCredentials

# Refresh this long before the real expiry so an in-flight request never
# races a token that expires mid-call — comfortably inside
# JWT_CLIENT_TTL_MINUTES (60min default, see backend/internal/config).
REFRESH_MARGIN = timedelta(minutes=5)


@dataclass(frozen=True)
class CachedToken:
    access_token: str
    expires_at: datetime


def needs_refresh(cached: CachedToken | None, now: datetime) -> bool:
    """Pure decision, split out from the HTTP call itself so it's
    unit-testable without a fake server."""
    if cached is None:
        return True
    return now >= cached.expires_at - REFRESH_MARGIN


class TokenCache:
    def __init__(self, oauth_url: str, credentials: CredentialsStore, timeout: float = 15.0):
        self._oauth_url = oauth_url.rstrip("/")
        self._credentials = credentials
        self._timeout = timeout
        self._cache: dict[UUID, CachedToken] = {}

    async def get_token(self, organization_id: UUID) -> str:
        cached = self._cache.get(organization_id)
        if not needs_refresh(cached, datetime.now(timezone.utc)):
            return cached.access_token

        creds = await self._credentials.get(organization_id)
        if creds is None:
            raise CredentialsError(
                f"no nfe-gateway OAuth credentials provisioned for organization {organization_id} — "
                "run `python -m nfe_gateway.provision_credentials` after creating its "
                "organization_api_client (source_system=nfe_gateway_distribution, "
                "scope=fiscal_documents:create)"
            )

        token = await self._fetch_token(creds)
        self._cache[organization_id] = token
        return token.access_token

    async def _fetch_token(self, creds: OrganizationCredentials) -> CachedToken:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._oauth_url}/v1/oauth/token",
                json={
                    "grant_type": "client_credentials",
                    "client_id": creds.client_id,
                    "client_secret": creds.client_secret,
                },
            )
        if resp.status_code >= 300:
            raise CredentialsError(f"token request failed ({resp.status_code}): {resp.text}")
        data = resp.json()
        return CachedToken(
            access_token=data["access_token"],
            expires_at=_parse_backend_timestamp(data["expires_at"]),
        )
