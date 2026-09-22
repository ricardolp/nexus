"""Entry point: `python -m nfe_gateway.workers.event_consumer`.

Consumes cancel / CC-e / inutilização commands from the Go backend and
publishes results. Domain status transitions stay in Go.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

import asyncpg
from lxml import etree
from pynfe.processamento.assinatura import AssinaturaA1

from nfe_gateway.backend_client import BackendClient
from nfe_gateway.broker import Broker
from nfe_gateway.config import encryption_key_bytes, load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.nfse.events import build_cancel_ped_reg_evento
from nfe_gateway.nfse.sefin import post_evento
from nfe_gateway.nfse.sign import sign_ped_reg_evento_xml
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import ephemeral_pfx_path
from nfe_gateway.sefaz.environment import resolve_homologacao
from nfe_gateway.sefaz.events import build_cancel_evento, build_cce_evento, parse_evento_cstat
from nfe_gateway.sefaz.tls_comunicacao import ComunicacaoSefazVerified
from nfe_gateway.storage import ObjectStore, build_object_store

logger = logging.getLogger("nfe_gateway.event_consumer")

CONSUMER_NAME = "nfe_gateway.event_consumer"
QUEUE_NAME = "nfe_gateway.event_requested"
ROUTING_KEYS = (
    "fiscal.document.cancel_requested.v1",
    "fiscal.document.cce_requested.v1",
    "fiscal.document.inutilization_requested.v1",
)
RESULT_KEY = "fiscal.document.event_result.v1"


def _is_nfse(data: dict[str, Any]) -> bool:
    doc_type = str(data.get("document_type") or "").strip().lower()
    if doc_type == "nfse":
        return True
    access_key = "".join(c for c in str(data.get("access_key") or "") if c.isalnum())
    return doc_type != "nfe" and len(access_key) == 50


def _xml_bytes(value: Any) -> bytes:
    if value is None:
        return b""
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str):
        return value.encode("utf-8")
    return etree.tostring(value, xml_declaration=True, encoding="UTF-8")


async def _persist_event_xmls(
    store: ObjectStore,
    *,
    base_key: str,
    signed_xml: Any,
    response_xml: Any,
) -> dict[str, str]:
    """Store cancel/CC-e request+response XML; return object keys for Go."""
    keys: dict[str, str] = {}
    request_bytes = _xml_bytes(signed_xml)
    response_bytes = _xml_bytes(response_xml)
    if request_bytes:
        request_key = f"{base_key}.cancel_request.xml"
        await store.put(request_key, "application/xml", request_bytes)
        keys["request_object_key"] = request_key
    if response_bytes:
        response_key = f"{base_key}.cancel_response.xml"
        await store.put(response_key, "application/xml", response_bytes)
        keys["response_object_key"] = response_key
    return keys


def _storage_base_key(data: dict[str, Any], document_id: str | None) -> str:
    explicit = str(data.get("payload_object_key") or "").strip()
    if explicit:
        return explicit
    org_company = str(data.get("organization_company_id") or "unknown")
    doc = str(document_id or data.get("document_id") or "event")
    return f"fiscal/events/{org_company}/{doc}"


async def handle_event(
    envelope: dict[str, Any],
    *,
    backend: BackendClient,
    broker: Broker,
    store: ObjectStore,
    force_homologacao: bool,
) -> None:
    data = envelope["data"]
    event_type = envelope.get("type", "")
    organization_id = UUID(envelope["organization_id"])
    organization_company_id = UUID(data["organization_company_id"])
    document_id = data.get("document_id")
    environment = data["environment"]
    homologacao = resolve_homologacao(environment, force_homologacao)

    material = await backend.get_signing_material(
        organization_id=organization_id, organization_company_id=organization_company_id
    )
    try:
        if event_type.endswith("cancel_requested.v1"):
            if _is_nfse(data):
                result = await _do_nfse_cancel(data, material.pfx, homologacao)
            else:
                uf = data["uf"]
                result = await _do_cancel(data, material.pfx, uf, homologacao)
        elif event_type.endswith("cce_requested.v1"):
            if _is_nfse(data):
                result = {
                    "outcome": "rejected",
                    "event_kind": "cce",
                    "error_message": "carta de correção is not supported for NFS-e Nacional",
                }
            else:
                uf = data["uf"]
                result = await _do_cce(data, material.pfx, uf, homologacao)
        elif event_type.endswith("inutilization_requested.v1"):
            uf = data["uf"]
            result = await _do_inutilizacao(data, material.pfx, uf, homologacao)
        else:
            result = {"outcome": "rejected", "error_message": f"unknown event type {event_type}"}
    finally:
        del material

    # Persist cancel/CC-e XML proof before stripping from the broker message.
    if result.get("signed_xml") or result.get("response_xml"):
        base_key = _storage_base_key(data, document_id)
        try:
            keys = await _persist_event_xmls(
                store,
                base_key=base_key,
                signed_xml=result.get("signed_xml"),
                response_xml=result.get("response_xml"),
            )
            result.update(keys)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "failed to persist event XML",
                extra={"document_id": document_id, "error": str(exc)},
            )

    await broker.publish(
        RESULT_KEY,
        _envelope(organization_id, document_id, event_type=event_type, **result),
    )


async def _do_nfse_cancel(data: dict, pfx: bytes, homologacao: bool) -> dict:
    c_motivo = str(data.get("c_motivo") or data.get("motivo") or "1").strip()
    x_motivo = str(data.get("justificativa") or data.get("x_motivo") or "").strip()
    unsigned = build_cancel_ped_reg_evento(
        chave=data["access_key"],
        cnpj=data["cnpj"],
        c_motivo=c_motivo,
        x_motivo=x_motivo,
        homologacao=homologacao,
    )
    signed = await asyncio.to_thread(sign_ped_reg_evento_xml, unsigned, pfx=pfx)
    result = await asyncio.to_thread(
        post_evento,
        chave=data["access_key"],
        signed_xml=signed,
        pfx=pfx,
        homologacao=homologacao,
    )
    # Map transport "error" to rejected so Go HandleEventResult can apply status.
    if result.get("outcome") == "error":
        result = {**result, "outcome": "rejected"}
    result["event_kind"] = "cancel"
    result["signed_xml"] = signed
    return result


async def _do_cancel(data: dict, pfx: bytes, uf: str, homologacao: bool) -> dict:
    unsigned = build_cancel_evento(
        chave=data["access_key"],
        protocolo=data["protocol"],
        cnpj=data["cnpj"],
        justificativa=data["justificativa"],
        homologacao=homologacao,
        n_seq=int(data.get("n_seq_evento") or 1),
    )
    with ephemeral_pfx_path(pfx) as cert_path:
        signed = AssinaturaA1(cert_path, "").assinar(unsigned)
        comunicacao = ComunicacaoSefazVerified(uf, cert_path, "", homologacao=homologacao)
        response = await asyncio.to_thread(comunicacao.evento, "55", signed, 1)
    parsed = parse_evento_cstat(response.content)
    parsed["event_kind"] = "cancel"
    parsed["response_xml"] = response.content
    parsed["signed_xml"] = _xml_bytes(signed)
    return parsed


async def _do_cce(data: dict, pfx: bytes, uf: str, homologacao: bool) -> dict:
    unsigned = build_cce_evento(
        chave=data["access_key"],
        cnpj=data["cnpj"],
        correcao=data["correcao"],
        homologacao=homologacao,
        n_seq=int(data.get("n_seq_evento") or 1),
    )
    with ephemeral_pfx_path(pfx) as cert_path:
        signed = AssinaturaA1(cert_path, "").assinar(unsigned)
        comunicacao = ComunicacaoSefazVerified(uf, cert_path, "", homologacao=homologacao)
        response = await asyncio.to_thread(comunicacao.evento, "55", signed, 1)
    parsed = parse_evento_cstat(response.content)
    parsed["event_kind"] = "cce"
    parsed["response_xml"] = response.content
    parsed["signed_xml"] = _xml_bytes(signed)
    return parsed


async def _do_inutilizacao(data: dict, pfx: bytes, uf: str, homologacao: bool) -> dict:
    with ephemeral_pfx_path(pfx) as cert_path:
        comunicacao = ComunicacaoSefazVerified(uf, cert_path, "", homologacao=homologacao)
        response = await asyncio.to_thread(
            comunicacao.inutilizacao,
            modelo=data.get("modelo") or "nfe",
            cnpj=("".join(c for c in data["cnpj"] if c.isdigit())),
            numero_inicial=int(data["numero_inicial"]),
            numero_final=int(data["numero_final"]),
            serie=str(data["serie"]),
            justificativa=data["justificativa"],
            ano=int(data.get("ano") or _now_year()),
        )
    root = etree.fromstring(response.content)

    def find_text(*names: str) -> str | None:
        for el in root.iter():
            if etree.QName(el).localname in names and el.text:
                return el.text
        return None

    cstat = find_text("cStat") or ""
    return {
        "event_kind": "inutilization",
        "cstat": cstat,
        "x_motivo": find_text("xMotivo") or "",
        "protocol": find_text("nProt"),
        "outcome": "accepted" if cstat in ("102", "563") else "rejected",
        "response_xml": response.content,
    }


def _now_year() -> int:
    from datetime import datetime

    return datetime.now().year % 100


def _envelope(organization_id: UUID, document_id: str | None, **data: Any) -> dict[str, Any]:
    import uuid
    from datetime import datetime, timezone

    # Never put raw XML in the broker message — strip before publish
    data = {
        k: v
        for k, v in data.items()
        if k not in ("response_xml", "signed_xml", "raw") and v is not None
    }
    return {
        "specversion": "1.0",
        "id": str(uuid.uuid4()),
        "source": "nfe_gateway/event_consumer",
        "type": RESULT_KEY,
        "subject": f"organization_documents/{document_id}" if document_id else "nfe_event",
        "time": datetime.now(timezone.utc).isoformat(),
        "datacontenttype": "application/json",
        "organization_id": str(organization_id),
        "data": {"document_id": document_id, **data},
    }


async def run() -> None:
    settings = load_settings()
    logging.basicConfig(level=settings.log_level)
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
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
    broker = Broker(settings.rabbitmq_url, settings.rabbitmq_exchange)
    await broker.connect()
    logger.info("event_consumer started")

    async def handler(envelope: dict[str, Any]) -> None:
        await handle_event(
            envelope,
            backend=backend,
            broker=broker,
            store=store,
            force_homologacao=settings.sefaz_force_homologacao,
        )

    try:
        for rk in ROUTING_KEYS:
            # bind all keys to one durable queue
            pass
        await broker.consume_multi(
            queue_name=QUEUE_NAME,
            routing_keys=list(ROUTING_KEYS),
            consumer_name=CONSUMER_NAME,
            pool=pool,
            handler=handler,
        )
    finally:
        await broker.close()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(run())
