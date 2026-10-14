"""Shared DistDFe non-procNFe routing used by distribution_poller and query_worker."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from nfe_gateway.sefaz.dist_event_classify import DistEventInfo, classify_dist_document
from nfe_gateway.sefaz.distribution import parse_pending_summary

if TYPE_CHECKING:
    from nfe_gateway.backend_client import BackendClient
    from nfe_gateway.db import Database
    from nfe_gateway.storage import ObjectStore

logger = logging.getLogger("nfe_gateway.dist_route")


async def route_non_proc_nfe_document(
    *,
    db: Database,
    backend: BackendClient,
    store: ObjectStore | None,
    organization_id: UUID,
    organization_company_id: UUID,
    schema: str,
    nsu: int,
    xml_bytes: bytes,
) -> DistEventInfo:
    """Route a DistDFe doc that is not procNFe.

    - outbound_event + matching outbound doc → internal API attach
    - inbound_pending → Ciência pending table
    - skip / outbound without match → log only
    """
    info = classify_dist_document(schema=schema, xml_bytes=xml_bytes)

    if info.route == "outbound_event" and info.chave:
        doc_id = await db.find_outbound_nfe_document_id(
            organization_id=organization_id,
            organization_company_id=organization_company_id,
            chave=info.chave,
        )
        if doc_id is not None:
            object_key = f"fiscal/dist_events/{organization_company_id}/{doc_id}/{nsu}.xml"
            if store is not None:
                await store.put(object_key, "application/xml", xml_bytes)
            await backend.attach_outbound_dist_event(
                organization_id=organization_id,
                document_id=doc_id,
                event_kind=info.event_kind or "event",
                tp_evento=info.tp_evento,
                manifestation_type=info.manifestation_type,
                protocol=info.protocol,
                n_seq_evento=info.n_seq_evento,
                justification=info.justification,
                dh_evento=info.dh_evento,
                schema=schema,
                nsu=nsu,
                xml_object_key=object_key,
                xml_bytes=xml_bytes if store is None else None,
            )
            logger.info(
                "dist_outbound_event_attached",
                extra={
                    "document_id": str(doc_id),
                    "chave": info.chave,
                    "tp_evento": info.tp_evento,
                    "event_kind": info.event_kind,
                },
            )
            return info
        logger.info(
            "dist_outbound_event_no_document",
            extra={"chave": info.chave, "tp_evento": info.tp_evento, "schema": schema},
        )
        # Fall through: resNFe-like summaries without an outbound match still
        # belong in Ciência when they look like inbound interest.
        if (schema or "").lower().startswith("resnfe"):
            info = DistEventInfo(route="inbound_pending", chave=info.chave, protocol=info.protocol)
        else:
            return DistEventInfo(route="skip", chave=info.chave, tp_evento=info.tp_evento)

    if info.route == "inbound_pending" and info.chave:
        summary = parse_pending_summary(xml_bytes)
        await db.upsert_pending_manifestation_document(
            organization_id=organization_id,
            organization_company_id=organization_company_id,
            chave=info.chave,
            nsu=nsu,
            schema=schema,
            cnpj_emitente=summary.cnpj_emitente if summary else None,
            nome_emitente=summary.nome_emitente if summary else None,
            valor=summary.valor if summary else None,
            data_emissao=summary.data_emissao if summary else None,
            protocolo=info.protocol or (summary.protocolo if summary else None),
            situacao=summary.situacao if summary else info.tp_evento,
        )
        return info

    logger.info(
        "dist_document_skipped",
        extra={"schema": schema, "chave": info.chave, "tp_evento": info.tp_evento, "route": info.route},
    )
    return info
