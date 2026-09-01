"""Entry point: `python -m nfe_gateway.workers.query_worker`.

On-demand SEFAZ queries triggered by a user from the fiscal documents
listing (consulta por NSU / por chave / em lote de chaves) — distinct from
the always-on distribution_poller, but sharing its exact rate-limit budget
per company (db.claim_company_for_on_demand_call) so the two never together
exceed SEFAZ's real 20/h ceiling for a company. See
docs/architecture/22_nfe_gateway_service.md.

Structured as a ticking claim loop, same shape as distribution_poller.py,
rather than a pure RabbitMQ consumer: a batch of many chaves routinely spans
several 1h rate-limit windows on its own, so resumability across ticks/
restarts has to be the primary mechanism regardless of how the first pass
gets triggered — a request left 'processing' with items still 'pending' is
just picked up again on the next tick. Everything downstream of the user's
click is already async with an in-app notification on completion (never a
page the user watches load), so a short poll tick costs nothing in practice.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from nfe_gateway.backend_client import BackendClient, BackendError
from nfe_gateway.broker import Broker
from nfe_gateway.config import load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.db import Database, QueryRequestRow
from nfe_gateway.distribution_state import PollOutcome, PollState, decide_next_poll, record_call
from nfe_gateway.metrics import start_if_configured
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import SefazClient
from nfe_gateway.sefaz.distribution import DistributionResult, classify_cstat, parse_pending_summary

logger = logging.getLogger("nfe_gateway.query_worker")

RESULT_ROUTING_KEY = "fiscal.document.query_result.v1"


# Raw docZip payloads for anything this pass sees but doesn't (or might not)
# end up durably stored by the backend — every skipped resNFe/resEvento/
# procEventoNFe, so a human can inspect/replay them later without spending
# another SEFAZ call, per an explicit ask (2026-08-17) to never let a
# fetched payload be lost even if the run gets aborted mid-way.
_PAYLOAD_DUMP_DIR = Path(__file__).resolve().parents[3] / "data" / "nsu_query_payloads"


def _dump_payload(req_id: uuid.UUID, doc) -> None:
    try:
        _PAYLOAD_DUMP_DIR.mkdir(parents=True, exist_ok=True)
        name = f"{req_id}_nsu{doc.nsu}_{doc.schema}.xml"
        (_PAYLOAD_DUMP_DIR / name).write_bytes(doc.xml_bytes)
    except OSError as exc:
        logger.warning("payload_dump_skipped", extra={"error": str(exc)})


class SigningMaterialUnavailable(Exception):
    """The company has no usable A1 certificate. Fail the request instead of
    retrying every tick — that path never reaches SEFAZ and would only spam
    internal_api."""


async def _call_sefaz_within_budget(
    db: Database,
    backend: BackendClient,
    sefaz: SefazClient,
    req: QueryRequestRow,
    *,
    last_nsu: int = 0,
    chave: str | None = None,
    consulta_nsu_especifico: bool = False,
) -> DistributionResult | None:
    """Claims the target company's shared rate-limit window, makes exactly
    one SEFAZ call if budget allows, and records the outcome the same way
    distribution_poller.py does (record_poll_result/insert_poll_log) so an
    admin looking at .../nfe_distribution sees on-demand calls in the same
    log as automatic ones. Returns None when no budget/lease is available
    right now — the caller must stop this pass and let a later tick resume.
    """
    await db.ensure_distribution_state(req.organization_id, req.organization_company_id)
    started = datetime.now(timezone.utc)
    try:
        material = await backend.get_signing_material(
            organization_id=req.organization_id,
            organization_company_id=req.organization_company_id,
        )
    except BackendError as exc:
        if exc.status_code in (404, 503):
            raise SigningMaterialUnavailable(
                "Empresa sem certificado A1 ativo. Envie o certificado em Configurações → Empresas e consulte de novo."
            ) from exc
        logger.warning(
            "on_demand_query_signing_material_failed: %s",
            exc,
            extra={"query_request_id": str(req.id), "company": str(req.organization_company_id)},
        )
        await db.insert_poll_log(
            req.organization_id, req.organization_company_id, last_nsu, None, 0,
            "error", str(exc), started, datetime.now(timezone.utc),
        )
        return None
    except Exception as exc:  # noqa: BLE001 — never reached SEFAZ, so do not take the hourly lease
        logger.warning(
            "on_demand_query_signing_material_failed: %s",
            exc,
            extra={"query_request_id": str(req.id), "company": str(req.organization_company_id)},
        )
        await db.insert_poll_log(
            req.organization_id, req.organization_company_id, last_nsu, None, 0,
            "error", str(exc), started, datetime.now(timezone.utc),
        )
        return None

    company = await db.claim_company_for_on_demand_call(req.organization_company_id)
    if company is None:
        logger.info(
            "on_demand_query_waiting_for_rate_limit",
            extra={"query_request_id": str(req.id), "company": str(req.organization_company_id)},
        )
        del material
        return None

    try:
        result = await sefaz.consult_distribution(
            uf=company.uf,
            environment=company.environment,
            cnpj=company.cnpj,
            pfx=material.pfx,
            last_nsu=last_nsu,
            chave=chave,
            consulta_nsu_especifico=consulta_nsu_especifico,
        )
    except Exception as exc:  # noqa: BLE001 — a real (attempted) SEFAZ/network failure
        logger.warning(
            "on_demand_query_call_failed: %s",
            exc,
            extra={"query_request_id": str(req.id), "company": str(req.organization_company_id)},
        )
        window = record_call(datetime.now(timezone.utc), company.window)
        decision = decide_next_poll(
            PollOutcome.ERROR,
            datetime.now(timezone.utc),
            PollState(company.consecutive_empty_polls, company.consecutive_errors),
            company.poll_interval_seconds,
            window,
        )
        await db.record_poll_result(
            company.state_id, decision.next_allowed_poll_at, decision.consecutive_empty_polls,
            decision.consecutive_errors, decision.status, None, str(exc), decision.window,
        )
        await db.insert_poll_log(
            req.organization_id, req.organization_company_id, last_nsu, None, 0,
            "error", str(exc), started, datetime.now(timezone.utc),
        )
        return None
    finally:
        del material

    finished = datetime.now(timezone.utc)
    window = record_call(finished, company.window)
    outcome = classify_cstat(result.cstat)
    decision = decide_next_poll(
        outcome, finished,
        PollState(company.consecutive_empty_polls, company.consecutive_errors),
        company.poll_interval_seconds, window,
    )
    await db.record_poll_result(
        company.state_id, decision.next_allowed_poll_at, decision.consecutive_empty_polls,
        decision.consecutive_errors, decision.status, result.cstat, None, decision.window,
    )
    await db.insert_poll_log(
        req.organization_id, req.organization_company_id, last_nsu, result.cstat, len(result.documents),
        outcome.value, None, started, finished, result.ult_nsu, result.max_nsu, result.xmotivo,
    )
    return result


async def _ingest(backend: BackendClient, req: QueryRequestRow, doc) -> uuid.UUID:
    # Same idempotency-key scheme as distribution_poller.py — a document's
    # NSU is its identity regardless of which query mode (auto poller,
    # on-demand NSU, chave, or batch) is the one that happened to surface it,
    # so all four paths naturally converge on the same backend row instead
    # of risking a duplicate.
    return await backend.ingest_inbound_nfe(
        organization_id=req.organization_id,
        idempotency_key=f"nfe-gateway:nsu:{doc.nsu}",
        xml_bytes=doc.xml_bytes,
    )


async def _process_chave_items(db: Database, backend: BackendClient, sefaz: SefazClient, req: QueryRequestRow) -> None:
    for item in await db.list_pending_query_items(req.id):
        result = await _call_sefaz_within_budget(db, backend, sefaz, req, chave=item["chave"])
        if result is None:
            return  # out of budget this pass — resume remaining items next tick
        if not result.documents:
            await db.mark_query_item_result(item["id"], "not_found")
            continue
        doc = result.documents[0]
        _dump_payload(req.id, doc)
        if not doc.schema.startswith("procNFe"):
            # Same missing_company gap as distribution_poller.py/_process_nsu
            # — a resNFe/resEvento/procEventoNFe has no <infNFe> to ingest.
            # Route it into the pending-manifestation table (so the user
            # sees it under "Pendentes de Manifestação" and can send
            # Ciência) instead of quietly failing this query item.
            summary = parse_pending_summary(doc.xml_bytes)
            if summary is not None and summary.chave:
                await db.upsert_pending_manifestation_document(
                    organization_id=req.organization_id,
                    organization_company_id=req.organization_company_id,
                    chave=summary.chave,
                    nsu=doc.nsu,
                    schema=doc.schema,
                    cnpj_emitente=summary.cnpj_emitente,
                    nome_emitente=summary.nome_emitente,
                    valor=summary.valor,
                    data_emissao=summary.data_emissao,
                    protocolo=summary.protocolo,
                    situacao=summary.situacao,
                )
            await db.mark_query_item_result(
                item["id"], "error",
                error_message="Encontrado apenas como resumo (sem Manifestação do Destinatário ainda) — veja em Pendentes de Manifestação.",
            )
            continue
        try:
            document_id = await _ingest(backend, req, doc)
            await db.mark_query_item_result(item["id"], "found", document_id=document_id)
        except BackendError as exc:
            await db.mark_query_item_result(item["id"], "error", error_message=str(exc))

    if await db.list_pending_query_items(req.id):
        return  # still pending — budget ran out partway through this pass
    await db.finish_query_request(req.id, "completed", {})


async def _process_nsu(db: Database, backend: BackendClient, sefaz: SefazClient, req: QueryRequestRow) -> None:
    progress = req.params.get("_progress", {})
    cursor = progress.get("cursor_nsu", req.params["nsu"])
    documents_found = progress.get("documents_found", 0)

    while True:
        result = await _call_sefaz_within_budget(db, backend, sefaz, req, last_nsu=cursor)
        if result is None:
            await db.update_query_request_progress(
                req.id, {**req.params, "_progress": {"cursor_nsu": cursor, "documents_found": documents_found}}
            )
            return

        for doc in result.documents:
            _dump_payload(req.id, doc)  # raw bytes on disk before anything else can fail
            if not doc.schema.startswith("procNFe"):
                # Same reasoning as distribution_poller.py: resNFe/resEvento
                # (summary only, no <infNFe>) and procEventoNFe (a real
                # event, but <infEvento> not <infNFe>) both fail backend
                # ingestion with missing_company — there's no <infNFe> to
                # extract a recipient CNPJ from. Log the chave when we can
                # parse one out so a human has something to follow up on
                # with a targeted "por chave" query later, instead of the
                # chave being silently lost once the cursor moves past it.
                summary = parse_pending_summary(doc.xml_bytes)
                logger.info(
                    "nsu_query_skipped_non_procnfe",
                    extra={
                        "query_request_id": str(req.id),
                        "nsu": doc.nsu,
                        "schema": doc.schema,
                        "chave": summary.chave if summary else None,
                    },
                )
                if summary is not None and summary.chave:
                    await db.upsert_pending_manifestation_document(
                        organization_id=req.organization_id,
                        organization_company_id=req.organization_company_id,
                        chave=summary.chave,
                        nsu=doc.nsu,
                        schema=doc.schema,
                        cnpj_emitente=summary.cnpj_emitente,
                        nome_emitente=summary.nome_emitente,
                        valor=summary.valor,
                        data_emissao=summary.data_emissao,
                        protocolo=summary.protocolo,
                        situacao=summary.situacao,
                    )
                cursor = doc.nsu
                continue
            try:
                await _ingest(backend, req, doc)
                documents_found += 1
            except BackendError as exc:
                logger.warning(
                    "nsu_query_ingest_failed",
                    extra={"query_request_id": str(req.id), "nsu": doc.nsu, "error": str(exc)},
                )
            cursor = doc.nsu

        outcome = classify_cstat(result.cstat)
        if outcome is PollOutcome.NO_CONTENT:
            await db.finish_query_request(
                req.id, "completed",
                {"documents_found": documents_found, "ult_nsu": result.ult_nsu, "max_nsu": result.max_nsu},
            )
            return
        if outcome is not PollOutcome.HAS_MORE:
            # rate_limited/error: _call_sefaz_within_budget already recorded
            # the backoff — persist progress and let a later tick resume.
            await db.update_query_request_progress(
                req.id, {**req.params, "_progress": {"cursor_nsu": cursor, "documents_found": documents_found}}
            )
            return
        # HAS_MORE: loop immediately: _call_sefaz_within_budget itself
        # refuses (returns None) once the window is exhausted.


async def process_query_request(db: Database, backend: BackendClient, sefaz: SefazClient, req: QueryRequestRow) -> None:
    try:
        if req.query_type == "nsu":
            await _process_nsu(db, backend, sefaz, req)
        else:
            await _process_chave_items(db, backend, sefaz, req)
    except SigningMaterialUnavailable as exc:
        for item in await db.list_pending_query_items(req.id):
            await db.mark_query_item_result(item["id"], "error", error_message=str(exc))
        await db.finish_query_request(req.id, "failed", {"error": str(exc)})


async def publish_finished_results(db: Database, broker: Broker | None, claimed: list[QueryRequestRow]) -> None:
    """Re-checks status after processing and publishes
    fiscal.document.query_result.v1 for any request that actually finished
    this pass — fiscal.QueryConsumer on the Go side re-reads the row (this
    process is the only writer of it) and turns that into a Notification.
    Requests still 'processing' (budget ran out) are left alone; the next
    tick that finishes them will publish then.
    """
    for req in claimed:
        row = await db.pool.fetchrow(
            "select status from fiscal_document_query_requests where id = $1", req.id
        )
        if row is None or row["status"] not in ("completed", "failed"):
            continue
        if broker is None:
            continue
        await broker.publish(
            RESULT_ROUTING_KEY,
            {
                "specversion": "1.0",
                "id": str(uuid.uuid4()),
                "source": "nfe_gateway/query_worker",
                "type": RESULT_ROUTING_KEY,
                "subject": f"fiscal_document_query_requests/{req.id}",
                "time": datetime.now(timezone.utc).isoformat(),
                "datacontenttype": "application/json",
                "organization_id": str(req.organization_id),
                "data": {"query_request_id": str(req.id)},
            },
        )


async def run() -> None:
    settings = load_settings()
    logging.basicConfig(level=settings.log_level)

    db = await Database.connect(settings.database_url)
    credentials = CredentialsStore(db.pool, settings.nfe_gateway_credentials_key)
    token_cache = TokenCache(settings.backend_control_plane_url, credentials)
    backend = BackendClient(
        settings.backend_inbound_url,
        settings.backend_internal_url,
        settings.nfe_gateway_service_token,
        token_cache,
    )
    sefaz: SefazClient = _build_sefaz_client(settings.sefaz_force_homologacao)
    broker: Broker | None = None
    if settings.rabbitmq_url:
        try:
            broker = Broker(settings.rabbitmq_url, settings.rabbitmq_exchange)
            await broker.connect()
        except Exception as exc:  # noqa: BLE001 — queue processing must not depend on notifications
            logger.warning("rabbitmq_unavailable", extra={"error": str(exc)})
            broker = None

    logger.info("query_worker started", extra={"notifications": broker is not None})
    start_if_configured(settings.metrics_port)
    try:
        while True:
            claimed = await db.claim_pending_query_requests(limit=20)
            if claimed:
                logger.info("claimed_query_requests", extra={"count": len(claimed)})
                for req in claimed:
                    try:
                        await process_query_request(db, backend, sefaz, req)
                    except Exception as exc:  # noqa: BLE001 — one bad request must not kill the tick loop
                        logger.exception(
                            "query_request_processing_failed",
                            extra={"query_request_id": str(req.id), "error": str(exc)},
                        )
                        await db.finish_query_request(req.id, "failed", {"error": str(exc)})
                await publish_finished_results(db, broker, claimed)
            await asyncio.sleep(settings.query_worker_tick_seconds)
    finally:
        if broker is not None:
            await broker.close()
        await db.close()


def _build_sefaz_client(force_homologacao: bool) -> SefazClient:
    from nfe_gateway.sefaz.client import PyNfeSefazClient

    return PyNfeSefazClient(force_homologacao=force_homologacao)


if __name__ == "__main__":
    asyncio.run(run())
