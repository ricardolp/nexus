"""On-demand ConsultaProtocolo for outbound NF-e — stores protNFe + linked events."""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any
from uuid import UUID

import asyncpg
from lxml import etree

from nfe_gateway.backend_client import BackendClient
from nfe_gateway.broker import Broker
from nfe_gateway.config import encryption_key_bytes, load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.autorizacao_result import parse_consulta_situacao_xml
from nfe_gateway.sefaz.client import ephemeral_pfx_path
from nfe_gateway.sefaz.dist_event_classify import (
    MANIFESTATION_TP_EVENTOS,
    TP_EVENTO_TO_KIND,
    TP_EVENTO_TO_MANIFESTATION,
)
from nfe_gateway.sefaz.environment import resolve_homologacao
from nfe_gateway.sefaz.tls_comunicacao import ComunicacaoSefazVerified
from nfe_gateway.storage import ObjectStore, build_object_store

logger = logging.getLogger("nfe_gateway.protocol_consumer")

CONSUMER_NAME = "nfe_gateway.protocol_consumer"
QUEUE_NAME = "nfe_gateway.protocol_requested"
ROUTING_KEYS = ("fiscal.document.protocol_requested.v1",)
RESULT_KEY = "fiscal.document.protocol_result.v1"


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _extract_prot_nfe(root: etree._Element) -> bytes | None:
    for el in root.iter():
        if _local(el) == "protNFe":
            return etree.tostring(el, xml_declaration=True, encoding="UTF-8")
    return None


def _iter_event_blocks(root: etree._Element) -> list[etree._Element]:
    blocks: list[etree._Element] = []
    for el in root.iter():
        if _local(el) == "procEventoNFe":
            blocks.append(el)
    return blocks


def _child_text(root: etree._Element, name: str) -> str | None:
    for el in root.iter():
        if _local(el) == name and el.text:
            return el.text.strip()
    return None


def parse_protocol_consult_events(root: etree._Element) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for block in _iter_event_blocks(root):
        tp = _child_text(block, "tpEvento")
        if not tp:
            continue
        kind = TP_EVENTO_TO_KIND.get(tp)
        if not kind and tp not in MANIFESTATION_TP_EVENTOS:
            continue
        if tp in MANIFESTATION_TP_EVENTOS:
            kind = "manifestation"
        events.append(
            {
                "event_kind": kind or "event",
                "tp_evento": tp,
                "manifestation_type": TP_EVENTO_TO_MANIFESTATION.get(tp),
                "protocol": _child_text(block, "nProt"),
                "n_seq_evento": _child_text(block, "nSeqEvento"),
                "justification": _child_text(block, "xJust") or _child_text(block, "xCorrecao"),
                "dh_evento": _child_text(block, "dhEvento"),
                "xml_base64": base64.b64encode(
                    etree.tostring(block, xml_declaration=True, encoding="UTF-8")
                ).decode("ascii"),
            }
        )
    return events


async def handle_protocol_request(
    envelope: dict[str, Any],
    *,
    backend: BackendClient,
    broker: Broker,
    store: ObjectStore,
    force_homologacao: bool,
) -> None:
    data = envelope["data"]
    organization_id = UUID(envelope["organization_id"])
    organization_company_id = UUID(data["organization_company_id"])
    document_id = data.get("document_id")
    environment = data["environment"]
    chave = "".join(c for c in str(data.get("access_key") or "") if c.isalnum())
    uf = data["uf"]
    homologacao = resolve_homologacao(environment, force_homologacao)

    material = await backend.get_signing_material(
        organization_id=organization_id, organization_company_id=organization_company_id
    )
    try:
        with ephemeral_pfx_path(material.pfx) as cert_path:
            comunicacao = ComunicacaoSefazVerified(uf, cert_path, "", homologacao=homologacao)
            response = await asyncio.to_thread(comunicacao.consulta_nota, "nfe", chave)
    finally:
        del material

    if getattr(response, "status_code", 200) >= 300:
        result = {
            "document_id": document_id,
            "outcome": "error",
            "error_message": f"SEFAZ HTTP {getattr(response, 'status_code', '?')}",
        }
        await broker.publish(RESULT_KEY, _envelope(organization_id, document_id, **result))
        return

    content = response.content if hasattr(response, "content") else response
    root = etree.fromstring(content)
    parsed = parse_consulta_situacao_xml(root)
    prot_bytes = _extract_prot_nfe(root)

    base_key = str(data.get("payload_object_key") or f"fiscal/protocol/{organization_company_id}/{document_id}")
    protocol_object_key = ""
    if prot_bytes:
        protocol_object_key = f"{base_key}.protocol.xml"
        await store.put(protocol_object_key, "application/xml", prot_bytes)

    events = parse_protocol_consult_events(root)
    result = {
        "document_id": document_id,
        "outcome": "ok" if parsed.outcome == "authorized" or prot_bytes else "not_found",
        "cstat": parsed.cstat,
        "x_motivo": parsed.x_motivo,
        "protocol": parsed.protocol,
        "access_key": parsed.access_key or chave,
        "protocol_object_key": protocol_object_key,
        "events": events,
    }
    if prot_bytes:
        result["protocol_xml_base64"] = base64.b64encode(prot_bytes).decode("ascii")

    await broker.publish(RESULT_KEY, _envelope(organization_id, document_id, **result))


def _envelope(organization_id: UUID, document_id: str | None, **data: Any) -> dict[str, Any]:
    import uuid
    from datetime import datetime, timezone

    return {
        "specversion": "1.0",
        "id": str(uuid.uuid4()),
        "source": "nfe_gateway/protocol_consumer",
        "type": RESULT_KEY,
        "subject": f"organization_documents/{document_id}" if document_id else "organization_documents",
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
    logger.info("protocol_consumer started")

    async def handler(envelope: dict[str, Any]) -> None:
        await handle_protocol_request(
            envelope,
            backend=backend,
            broker=broker,
            store=store,
            force_homologacao=settings.sefaz_force_homologacao,
        )

    try:
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
