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
from nfe_gateway.config import encryption_key_bytes, load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.metrics import record_transmission_outcome, start_if_configured
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
    force_homologacao: bool = True,
) -> None:
    data = envelope["data"]
    document_id = data["document_id"]
    organization_id = UUID(envelope["organization_id"])
    organization_company_id = UUID(data["organization_company_id"])
    payload_object_key = data["payload_object_key"]
    environment = data["environment"]
    content_type = data.get("payload_content_type", "application/json")
    document_type = (data.get("document_type") or "nfe").lower()

    payload_bytes = await store.get(payload_object_key)
    material = await backend.get_signing_material(
        organization_id=organization_id, organization_company_id=organization_company_id
    )

    try:
        if document_type == "nfse":
            from nfe_gateway.nfse import transmit_nfse

            result = await asyncio.to_thread(
                transmit_nfse,
                environment=environment,
                pfx=material.pfx,
                payload_bytes=payload_bytes,
                force_homologacao=force_homologacao,
            )
        else:
            uf = data.get("uf") or ""
            if not uf:
                raise ValueError("uf is required for NF-e transmission")
            result = await sefaz.transmit_nfe(
                uf=uf,
                environment=environment,
                pfx=material.pfx,
                payload_bytes=payload_bytes,
                content_type=content_type,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("transmission failed", extra={"document_id": document_id, "error": str(exc)})
        await broker.publish(
            RESULT_ROUTING_KEY,
            _result_envelope(organization_id, document_id, outcome="error", error_message=str(exc)),
        )
        return
    finally:
        del material

    # Store signed XML if available (provider_request)
    request_key = None
    if "signed_xml" in result and result["signed_xml"]:
        request_key = f"{payload_object_key}.provider_request.xml"
        await store.put(request_key, "application/xml", result["signed_xml"])

    # Store SEFAZ/SEFIN response
    response_key = f"{payload_object_key}.sefaz_response.xml"
    await store.put(response_key, "application/xml", result.get("response_xml", b""))

    dest = "sefin" if document_type == "nfse" else "sefaz"
    http_status = result.get("http_status")
    if http_status is None:
        outcome = result.get("outcome") or ""
        if outcome == "authorized":
            http_status = 200
        elif outcome == "rejected":
            http_status = 400
        else:
            http_status = 500
    resp_preview = ""
    raw_xml = result.get("response_xml") or b""
    if isinstance(raw_xml, (bytes, bytearray)):
        resp_preview = raw_xml[:4096].decode("utf-8", errors="replace")
    await backend.record_integration_log(
        organization_id=organization_id,
        destination=dest,
        summary=f"{document_type} transmission {result.get('outcome')} {document_id}",
        http_method="POST",
        http_path=dest,
        http_status=int(http_status),
        request_body_preview=(result.get("signed_xml") or b"")[:4096].decode("utf-8", errors="replace")
        if isinstance(result.get("signed_xml"), (bytes, bytearray))
        else "",
        response_body_preview=resp_preview,
        request_payload_key=request_key or "",
        response_payload_key=response_key,
        span_name=f"outbound.{dest}.transmit",
        metadata={
            "document_id": str(document_id),
            "outcome": result.get("outcome"),
            "cstat": result.get("cstat"),
            "x_motivo": result.get("x_motivo"),
        },
    )

    await broker.publish(
        RESULT_ROUTING_KEY,
        _result_envelope(
            organization_id,
            document_id,
            outcome=result["outcome"],  # 'authorized' | 'rejected' | 'error' | 'waiting_recibo'
            protocol=result.get("protocol"),
            access_key=result.get("access_key"),
            cstat=result.get("cstat"),
            x_motivo=result.get("x_motivo"),
            error_code=result.get("error_code"),
            error_message=result.get("error_message"),
            request_object_key=request_key,
            response_object_key=response_key,
            receipt=result.get("receipt"),
            tp_emis=result.get("tp_emis"),
            number=result.get("number"),
            verification_code=result.get("verification_code"),
        ),
    )
    record_transmission_outcome(str(result.get("outcome") or "unknown"))


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
        "data": {"document_id": document_id, **{k: v for k, v in data.items() if v is not None}},
    }


async def run() -> None:
    settings = load_settings()
    logging.basicConfig(level=settings.log_level)
    start_if_configured(settings.metrics_port)

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
    store = build_object_store(
        settings.storage_backend,
        settings.storage_local_path,
        encryption_key_bytes(settings),
    )
    sefaz = _build_sefaz_client(settings.sefaz_force_homologacao)
    broker = Broker(settings.rabbitmq_url, settings.rabbitmq_exchange)
    await broker.connect()

    logger.info("outbound_consumer started")

    async def handler(envelope: dict[str, Any]) -> None:
        await handle_transmission_requested(
            envelope,
            backend=backend,
            store=store,
            sefaz=sefaz,
            broker=broker,
            force_homologacao=settings.sefaz_force_homologacao,
        )

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
