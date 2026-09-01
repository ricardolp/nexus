"""Entry point: `python -m nfe_gateway.workers.manifestation_worker`.

Processes nfe_manifestation_requests — deliberate, one-click "send Ciência
da Operação for this pending document" asks (see internal/fiscal/
pending_document_service.go on the Go side, and sefaz/manifestation.py's
module docstring for why only Ciência is exposed, never the other three
manifestação outcomes). Ticking claim loop, same shape as
distribution_poller.py/query_worker.py, but deliberately does NOT share
organization_company_nfe_distribution_state's window — RecepcaoEvento
(event submission) is a different SEFAZ webservice from distDFeInt (the
query the 20/h ceiling was researched against), and conflating the two
would either wrongly block manifestation behind an unrelated budget or
wrongly assume a shared one that was never confirmed.
"""

from __future__ import annotations

import asyncio
import logging

from nfe_gateway.backend_client import BackendClient
from nfe_gateway.config import load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.db import Database, ManifestationRequestRow
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import SefazClient

logger = logging.getLogger("nfe_gateway.manifestation_worker")


async def process_request(db: Database, backend: BackendClient, sefaz: SefazClient, req: ManifestationRequestRow) -> None:
    try:
        material = await backend.get_signing_material(
            organization_id=req.organization_id,
            organization_company_id=req.organization_company_id,
        )
    except Exception as exc:  # noqa: BLE001 — never reached SEFAZ
        logger.warning(
            "manifestation_signing_material_failed",
            extra={"request_id": str(req.id), "chave": req.chave, "error": str(exc)},
        )
        await db.fail_manifestation_request(req.id, req.pending_document_id, str(exc))
        return

    try:
        result = await sefaz.submit_ciencia(
            uf=req.uf,
            environment=req.environment,
            cnpj=req.company_cnpj,
            pfx=material.pfx,
            chave=req.chave,
        )
    except Exception as exc:  # noqa: BLE001 — a real (attempted) SEFAZ/network failure
        logger.warning(
            "manifestation_call_failed",
            extra={"request_id": str(req.id), "chave": req.chave, "error": str(exc)},
        )
        await db.fail_manifestation_request(req.id, req.pending_document_id, str(exc))
        return
    finally:
        del material

    if not result.accepted:
        logger.warning(
            "manifestation_rejected",
            extra={
                "request_id": str(req.id),
                "chave": req.chave,
                "lote_cstat": result.lote_cstat,
                "evento_cstat": result.evento_cstat,
                "evento_xmotivo": result.evento_xmotivo,
            },
        )
        await db.fail_manifestation_request(
            req.id, req.pending_document_id,
            f"cStat {result.evento_cstat or result.lote_cstat}: {result.evento_xmotivo or result.lote_xmotivo}",
        )
        return

    logger.info(
        "manifestation_accepted",
        extra={"request_id": str(req.id), "chave": req.chave, "protocolo": result.protocolo},
    )
    await db.complete_manifestation_request(req.id, req.pending_document_id, result.protocolo)


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

    logger.info("manifestation_worker started")
    try:
        while True:
            claimed = await db.claim_pending_manifestation_requests(limit=20)
            if claimed:
                logger.info("claimed_manifestation_requests", extra={"count": len(claimed)})
                for req in claimed:
                    try:
                        await process_request(db, backend, sefaz, req)
                    except Exception as exc:  # noqa: BLE001 — one bad request must not kill the tick loop
                        logger.exception(
                            "manifestation_request_processing_failed",
                            extra={"request_id": str(req.id), "error": str(exc)},
                        )
                        await db.fail_manifestation_request(req.id, req.pending_document_id, str(exc))
            await asyncio.sleep(settings.query_worker_tick_seconds)
    finally:
        await db.close()


def _build_sefaz_client(force_homologacao: bool) -> SefazClient:
    from nfe_gateway.sefaz.client import PyNfeSefazClient

    return PyNfeSefazClient(force_homologacao=force_homologacao)


if __name__ == "__main__":
    asyncio.run(run())
