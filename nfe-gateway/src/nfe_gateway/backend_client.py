"""Everything the gateway needs from the Go backend over HTTP: pushing
ingested inbound documents through the existing intake pipeline, and pulling
ephemeral certificate signing material. Both calls are the only places this
service crosses a process boundary into backend-owned territory — see
docs/architecture/22_nfe_gateway_service.md.

The two calls authenticate completely differently, on purpose:
- ingest_inbound_nfe hits the *public* inbound_api, so it needs a real
  per-organization OAuth client-credentials token (see oauth.py) — the same
  mechanism any ERP integration uses, not a gateway-specific shortcut.
- get_signing_material hits the *internal-only* internal_api, gated by a
  single static service token (NFE_GATEWAY_SERVICE_TOKEN) — deliberately
  simpler, since that endpoint is never reachable from outside the private
  network in the first place.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import httpx

from nfe_gateway.oauth import TokenCache


class BackendError(RuntimeError):
    def __init__(self, status_code: int, body: str):
        super().__init__(f"backend returned {status_code}: {body}")
        self.status_code = status_code
        self.body = body


@dataclass
class SigningMaterial:
    pfx: bytes
    thumbprint: str


class BackendClient:
    def __init__(
        self,
        inbound_url: str,
        internal_url: str,
        service_token: str,
        token_cache: TokenCache,
        timeout: float = 30.0,
    ):
        self._inbound_url = inbound_url.rstrip("/")
        self._internal_url = internal_url.rstrip("/")
        self._service_token = service_token
        self._token_cache = token_cache
        self._timeout = timeout

    async def ingest_inbound_nfe(
        self,
        *,
        organization_id: UUID,
        idempotency_key: str,
        xml_bytes: bytes,
        correlation_id: str | None = None,
    ) -> UUID:
        """POST /v1/inbound/fiscal_documents/nfe — same endpoint any ERP would
        use, authenticated the same way (client-credentials JWT scoped to
        this organization, see oauth.py — NOT the internal_api's static
        service token). Success (2xx) OR an idempotent replay of an
        already-seen idempotency_key are both treated as success by the
        caller; only then is it safe to advance last_nsu (see
        workers/distribution_poller.py). Returns the backend's document_id
        (present on both the 202-new and 200-replayed response bodies —
        see receiveInboundDocument/handlers.go) so callers that need to
        reference the resulting document (workers/query_worker.py, linking a
        found chave back to the row it created) don't have to look it up
        separately.
        """
        access_token = await self._token_cache.get_token(organization_id)
        headers = {
            "Content-Type": "application/xml",
            "Idempotency-Key": idempotency_key,
            "Authorization": f"Bearer {access_token}",
        }
        if correlation_id:
            headers["X-Correlation-Id"] = correlation_id

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._inbound_url}/v1/inbound/fiscal_documents/nfe",
                content=xml_bytes,
                headers=headers,
            )
        if resp.status_code >= 300:
            raise BackendError(resp.status_code, resp.text)
        return UUID(resp.json()["document_id"])

    async def get_signing_material(
        self, *, organization_id: UUID, organization_company_id: UUID
    ) -> SigningMaterial:
        """Internal-only endpoint (never exposed on the public inbound_api).
        The PFX comes back once, is used immediately, and must never be
        written to durable storage — see the "Certificado digital" section
        of the architecture doc.

        organization_id is required in the JSON body (internal_api.go's
        signingMaterial handler cross-checks it against the company before
        exporting) — company_id alone in the URL isn't sufficient.
        """
        headers = {"Authorization": f"Bearer {self._service_token}"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._internal_url}/internal/v1/companies/{organization_company_id}/certificates/signing-material",
                headers=headers,
                json={"organization_id": str(organization_id)},
            )
        if resp.status_code >= 300:
            raise BackendError(resp.status_code, resp.text)
        data = resp.json()
        import base64

        return SigningMaterial(pfx=base64.b64decode(data["pfx_base64"]), thumbprint=data["thumbprint"])
