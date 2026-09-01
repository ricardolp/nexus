"""Entry point: `python -m nfe_gateway.workers.outbound_consumer`.

Consumes `fiscal.document.transmission_requested.v1` (published by the Go
`fiscal_worker` once it decides a document should go through this gateway
instead of the local StubProvider), signs + transmits via SEFAZ, and
publishes `fiscal.document.transmission_result.v1` back — the Go side is the
only writer of organization_documents, this process never touches that
table. See the "Fluxo outbound" sequence diagram in
docs/architecture/22_nfe_gateway_service.md.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

import asyncpg

from nfe_gateway.backend_client import BackendClient
from nfe_gateway.broker import Broker
from nfe_gateway.config import load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import SefazClient
from nfe_gateway.storage import ObjectStore, build_object_store

logger = logging.getLogger("nfe_gateway.outbound_consumer")

CONSUMER_NAME = "nfe_gateway.outbound_consumer"
QUEUE_NAME = "nfe_gateway.transmission_requested"
ROUTING_KEY = "fiscal.document.transmission_requested.v1"
RESULT_ROUTING_KEY = "fiscal.document.transmission_result.v1"


async def handle_transmission_requested(
    envelope: dict[str, Any],
    *,
    backend: BackendClient,
    store: ObjectStore,
    sefaz: SefazClient,
    broker: Broker,
) -> None:
    data = envelope["data"]
    document_id = data["document_id"]
    organization_id = UUID(envelope["organization_id"])
    organization_company_id = UUID(data["organization_company_id"])
    payload_object_key = data["payload_object_key"]
    uf = data["uf"]
    environment = data["environment"]

    xml_bytes = await store.get(payload_object_key)
    material = await backend.get_signing_material(
        organization_id=organization_id, organization_company_id=organization_company_id
    )

    try:
        result = await sefaz.transmit_nfe(uf=uf, environment=environment, pfx=material.pfx, xml_bytes=xml_bytes)
    except Exception as exc:  # noqa: BLE001
        logger.warning("transmission failed", extra={"document_id": document_id, "error": str(exc)})
        await broker.publish(
            RESULT_ROUTING_KEY,
            _result_envelope(organization_id, document_id, outcome="error", error_message=str(exc)),
        )
        return
    finally:
        del material

    response_key = f"{payload_object_key}.sefaz_response.xml"
    await store.put(response_key, "application/xml", result.get("response_xml", b""))

    await broker.publish(
        RESULT_ROUTING_KEY,
        _result_envelope(
            organization_id,
            document_id,
            outcome=result["outcome"],  # 'authorized' | 'rejected'
            protocol=result.get("protocol"),
            error_code=result.get("error_code"),
            error_message=result.get("error_message"),
            response_object_key=response_key,
        ),
    )


def _result_envelope(organization_id: UUID, document_id: str, **data: Any) -> dict[str, Any]:
    import uuid
    from datetime import datetime, timezone

    return {
        "specversion": "1.0",
        "id": str(uuid.uuid4()),
        "source": "nfe_gateway/outbound_consumer",
        "type": RESULT_ROUTING_KEY,
        "subject": f"organization_documents/{document_id}",
        "time": datetime.now(timezone.utc).isoformat(),
        "datacontenttype": "application/json",
        "organization_id": str(organization_id),
        "data": {"document_id": document_id, **data},
    }


async def run() -> None:
    settings = load_settings()
    logging.basicConfig(level=settings.log_level)

    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    # This consumer only ever calls get_signing_material (static service
    # token) — never ingest_inbound_nfe — but BackendClient's interface
    # stays uniform rather than making token_cache optional for one caller.
    credentials = CredentialsStore(pool, settings.nfe_gateway_credentials_key)
    token_cache = TokenCache(settings.backend_control_plane_url, credentials)
    backend = BackendClient(
        settings.backend_inbound_url,
        settings.backend_internal_url,
        settings.nfe_gateway_service_token,
        token_cache,
    )
    store = build_object_store(settings.storage_backend, settings.storage_local_path)
    sefaz = _build_sefaz_client(settings.sefaz_force_homologacao)
    broker = Broker(settings.rabbitmq_url, settings.rabbitmq_exchange)
    await broker.connect()

    logger.info("outbound_consumer started")

    async def handler(envelope: dict[str, Any]) -> None:
        await handle_transmission_requested(envelope, backend=backend, store=store, sefaz=sefaz, broker=broker)

    try:
        await broker.consume(
            queue_name=QUEUE_NAME,
            routing_key=ROUTING_KEY,
            consumer_name=CONSUMER_NAME,
            pool=pool,
            handler=handler,
        )
    finally:
        await broker.close()
        await pool.close()


def _build_sefaz_client(force_homologacao: bool) -> SefazClient:
    from nfe_gateway.sefaz.client import PyNfeSefazClient

    return PyNfeSefazClient(force_homologacao=force_homologacao)


if __name__ == "__main__":
    asyncio.run(run())
