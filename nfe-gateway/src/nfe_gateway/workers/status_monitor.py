"""Entry point: `python -m nfe_gateway.workers.status_monitor`.

Polls SEFAZ statusServico per (organization, UF) and publishes
`sefaz.status.changed.v1` so the Go side can drive contingency decisions.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

from nfe_gateway.backend_client import BackendClient
from nfe_gateway.broker import Broker
from nfe_gateway.config import load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import ephemeral_pfx_path
from nfe_gateway.sefaz.environment import resolve_homologacao
from nfe_gateway.sefaz.tls_comunicacao import ComunicacaoSefazVerified
from nfe_gateway.metrics import record_sefaz_call

logger = logging.getLogger("nfe_gateway.status_monitor")

STATUS_ROUTING_KEY = "sefaz.status.changed.v1"


async def poll_company_status(
    *,
    pool: asyncpg.Pool,
    backend: BackendClient,
    broker: Broker,
    force_homologacao: bool,
) -> None:
    rows = await pool.fetch(
        """
        SELECT oc.id AS organization_company_id,
               oc.organization_id,
               oc.uf,
               oc.environment
          FROM organization_companies oc
          JOIN organization_company_services ocs
            ON ocs.organization_company_id = oc.id
           AND ocs.status = 'active'
          JOIN services svc
            ON svc.id = ocs.service_id
           AND svc.code = 'nfe_outbound'
           AND svc.status = 'active'
         WHERE oc.uf IS NOT NULL
           AND oc.status = 'active'
        """
    )
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        key = (str(row["organization_id"]), row["uf"], row["environment"] or "homologation")
        if key in seen:
            continue
        seen.add(key)
        try:
            await _consult_one(
                backend=backend,
                broker=broker,
                organization_id=row["organization_id"],
                organization_company_id=row["organization_company_id"],
                uf=row["uf"],
                environment=row["environment"] or "homologation",
                force_homologacao=force_homologacao,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "status consult failed",
                extra={"uf": row["uf"], "error": str(exc)},
            )


async def _consult_one(
    *,
    backend: BackendClient,
    broker: Broker,
    organization_id: UUID,
    organization_company_id: UUID,
    uf: str,
    environment: str,
    force_homologacao: bool,
) -> None:
    material = await backend.get_signing_material(
        organization_id=organization_id, organization_company_id=organization_company_id
    )
    homologacao = resolve_homologacao(environment, force_homologacao)
    try:
        with ephemeral_pfx_path(material.pfx) as cert_path:
            comunicacao = ComunicacaoSefazVerified(uf, cert_path, "", homologacao=homologacao)
            response = await asyncio.to_thread(comunicacao.status_servico, "nfe")
        record_sefaz_call(operation="status_servico", uf=uf, ok=response.status_code < 300)
        from lxml import etree

        root = etree.fromstring(response.content)

        def find_text(name: str) -> str | None:
            for el in root.iter():
                if etree.QName(el).localname == name:
                    return el.text
            return None

        cstat = find_text("cStat") or ""
        await broker.publish(
            STATUS_ROUTING_KEY,
            {
                "specversion": "1.0",
                "id": str(__import__("uuid").uuid4()),
                "source": "nfe_gateway/status_monitor",
                "type": STATUS_ROUTING_KEY,
                "subject": f"organization_companies/{organization_company_id}",
                "time": datetime.now(timezone.utc).isoformat(),
                "datacontenttype": "application/json",
                "organization_id": str(organization_id),
                "data": {
                    "organization_company_id": str(organization_company_id),
                    "uf": uf,
                    "environment": environment,
                    "cstat": cstat,
                    "x_motivo": find_text("xMotivo") or "",
                    "tp_amb": find_text("tpAmb"),
                    "service": "NfeStatusServico",
                    "online": cstat == "107",
                    "consulted_at": datetime.now(timezone.utc).isoformat(),
                },
            },
        )
    finally:
        del material


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
    broker = Broker(settings.rabbitmq_url, settings.rabbitmq_exchange)
    await broker.connect()
    interval = max(60, settings.sefaz_status_interval_seconds)
    logger.info("status_monitor started", extra={"interval_seconds": interval})
    try:
        while True:
            await poll_company_status(
                pool=pool,
                backend=backend,
                broker=broker,
                force_homologacao=settings.sefaz_force_homologacao,
            )
            await asyncio.sleep(interval)
    finally:
        await broker.close()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(run())
