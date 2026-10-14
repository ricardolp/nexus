"""Entry point: `python -m nfe_gateway.workers.distribution_poller`.

Ticks on an interval, claims companies whose distribution-state row is due
(FOR UPDATE SKIP LOCKED — safe to run several replicas of this process),
consults SEFAZ, hands each document to the backend's existing inbound
pipeline, and only then advances last_nsu. See the "Fluxo inbound" sequence
diagram in docs/architecture/22_nfe_gateway_service.md, and
distribution_state.py's module docstring for exactly why the SEFAZ rate
limit (20 calls/hour, confirmed against NT 2014.002) drives every timing
decision here — this file must never call SEFAZ more than once without
going through record_call/decide_next_poll in between.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from nfe_gateway.backend_client import BackendClient
from nfe_gateway.config import encryption_key_bytes, load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.db import Database, DueCompany
from nfe_gateway.distribution_state import PollOutcome, PollState, decide_next_poll, record_call
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import SefazClient
from nfe_gateway.sefaz.distribution import classify_cstat
from nfe_gateway.storage import ObjectStore, build_object_store
from nfe_gateway.workers.dist_route import route_non_proc_nfe_document

logger = logging.getLogger("nfe_gateway.distribution_poller")


async def process_company(
    db: Database,
    backend: BackendClient,
    sefaz: SefazClient,
    company: DueCompany,
    store: ObjectStore | None = None,
) -> None:
    started = datetime.now(timezone.utc)
    try:
        material = await backend.get_signing_material(
            organization_id=company.organization_id,
            organization_company_id=company.organization_company_id,
        )
    except Exception as exc:  # noqa: BLE001 — backend/keyvault failure, never reached SEFAZ
        logger.warning(
            "signing material fetch failed", extra={"company": str(company.organization_company_id), "error": str(exc)}
        )
        # No SEFAZ call was attempted, so the hourly call window is left
        # untouched (contrast with the consult_distribution except branch
        # below, which does record_call — that one really did reach, or try
        # to reach, SEFAZ).
        await _finish_poll(
            db, company, started, company.window, outcome="error", cstat=None, documents_found=0, error_message=str(exc)
        )
        return

    try:
        result = await sefaz.consult_distribution(
            uf=company.uf,
            environment=company.environment,
            cnpj=company.cnpj,
            pfx=material.pfx,
            last_nsu=company.last_nsu,
        )
    except Exception as exc:  # noqa: BLE001 — any SEFAZ/network failure is a poll-level error
        logger.warning("distribution poll failed", extra={"company": str(company.organization_company_id), "error": str(exc)})
        # A failed call still reached SEFAZ (or tried to) and counts against
        # the hourly budget just as much as a successful one.
        window = record_call(datetime.now(timezone.utc), company.window)
        await _finish_poll(db, company, started, window, outcome="error", cstat=None, documents_found=0, error_message=str(exc))
        return
    finally:
        del material  # drop the reference as soon as it's out of use; see sefaz/client.py

    window = record_call(datetime.now(timezone.utc), company.window)

    documents_ingested = 0
    documents_summary_only = 0
    try:
        for doc in result.documents:
            if not doc.schema.startswith("procNFe"):
                documents_summary_only += 1
                await route_non_proc_nfe_document(
                    db=db,
                    backend=backend,
                    store=store,
                    organization_id=company.organization_id,
                    organization_company_id=company.organization_company_id,
                    schema=doc.schema,
                    nsu=doc.nsu,
                    xml_bytes=doc.xml_bytes,
                )
                await db.advance_nsu(company.state_id, last_nsu=doc.nsu, max_nsu=result.max_nsu)
                continue
            await backend.ingest_inbound_nfe(
                organization_id=company.organization_id,
                idempotency_key=f"nfe-gateway:nsu:{doc.nsu}",
                xml_bytes=doc.xml_bytes,
            )
            documents_ingested += 1
            await db.advance_nsu(company.state_id, last_nsu=doc.nsu, max_nsu=result.max_nsu)
    except Exception as exc:  # noqa: BLE001 — SEFAZ answered fine, ingest into the backend is what failed
        logger.warning("inbound ingest failed", extra={"company": str(company.organization_company_id), "error": str(exc)})
        # Documents before the failing one already got advance_nsu'd above,
        # so a retry resumes at the right NSU instead of re-ingesting them —
        # but the poll itself still needs to finish (log + backoff), same as
        # the two failure branches above, or this company's lease never
        # clears and it just silently stops getting claimed.
        await _finish_poll(
            db, company, started, window, outcome="error", cstat=result.cstat, documents_found=len(result.documents),
            error_message=str(exc), ult_nsu=result.ult_nsu, max_nsu=result.max_nsu, xmotivo=result.xmotivo,
            documents_ingested=documents_ingested, documents_summary_only=documents_summary_only,
        )
        return

    outcome = classify_cstat(result.cstat)
    await _finish_poll(
        db,
        company,
        started,
        window,
        outcome=outcome.value,
        cstat=result.cstat,
        documents_found=len(result.documents),
        error_message=None,
        ult_nsu=result.ult_nsu,
        max_nsu=result.max_nsu,
        xmotivo=result.xmotivo,
        documents_ingested=documents_ingested,
        documents_summary_only=documents_summary_only,
    )


async def _finish_poll(
    db: Database,
    company: DueCompany,
    started: datetime,
    window,
    *,
    outcome: str,
    cstat: str | None,
    documents_found: int,
    error_message: str | None,
    ult_nsu: int | None = None,
    max_nsu: int | None = None,
    xmotivo: str | None = None,
    documents_ingested: int = 0,
    documents_summary_only: int = 0,
) -> None:
    finished = datetime.now(timezone.utc)
    await db.insert_poll_log(
        organization_id=company.organization_id,
        organization_company_id=company.organization_company_id,
        requested_nsu=company.last_nsu,
        cstat=cstat,
        documents_found=documents_found,
        outcome=outcome,
        error_message=error_message,
        started_at=started,
        finished_at=finished,
        ult_nsu=ult_nsu,
        max_nsu=max_nsu,
        xmotivo=xmotivo,
        documents_ingested=documents_ingested,
        documents_summary_only=documents_summary_only,
    )

    decision = decide_next_poll(
        PollOutcome(outcome),
        now=finished,
        state=PollState(
            consecutive_empty_polls=company.consecutive_empty_polls,
            consecutive_errors=company.consecutive_errors,
        ),
        poll_interval_seconds=company.poll_interval_seconds,
        window=window,
    )
    if decision.next_allowed_poll_at > finished:
        logger.info(
            "next_poll_scheduled",
            extra={
                "company": str(company.organization_company_id),
                "outcome": outcome,
                "next_allowed_poll_at": decision.next_allowed_poll_at.isoformat(),
                "calls_in_window": decision.window.calls,
            },
        )
    await db.record_poll_result(
        company.state_id,
        next_allowed_poll_at=decision.next_allowed_poll_at,
        consecutive_empty_polls=decision.consecutive_empty_polls,
        consecutive_errors=decision.consecutive_errors,
        status=decision.status,
        last_cstat=cstat,
        last_message=error_message,
        window=decision.window,
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
    store = build_object_store(
        settings.storage_backend,
        settings.storage_local_path,
        encryption_key_bytes(settings),
    )
    semaphore = asyncio.Semaphore(settings.distribution_max_concurrent_sefaz_calls)

    logger.info("distribution_poller started")
    try:
        while True:
            companies = await db.claim_due_companies(limit=50)
            if companies:
                logger.info("claimed_due_companies", extra={"count": len(companies)})

            async def bounded(c: DueCompany) -> None:
                async with semaphore:
                    await process_company(db, backend, sefaz, c, store=store)

            await asyncio.gather(*(bounded(c) for c in companies))
            await asyncio.sleep(settings.distribution_poll_tick_seconds)
    finally:
        await db.close()


def _build_sefaz_client(force_homologacao: bool) -> SefazClient:
    from nfe_gateway.sefaz.client import PyNfeSefazClient

    return PyNfeSefazClient(force_homologacao=force_homologacao)


if __name__ == "__main__":
    asyncio.run(run())
