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
import json
import logging
from typing import Any
from uuid import UUID

import asyncpg

from nfe_gateway.backend_client import BackendClient, BackendError
from nfe_gateway.broker import Broker
from nfe_gateway.config import encryption_key_bytes, load_settings
from nfe_gateway.credentials import CredentialsStore
from nfe_gateway.metrics import record_transmission_outcome, start_if_configured
from nfe_gateway.nfse.parametros import (
    cached_convenio,
    diagnose_convenio,
    emitter_municipality,
    is_cnc_rejection,
)
from nfe_gateway.oauth import TokenCache
from nfe_gateway.sefaz.client import SefazClient, is_name_resolution_error
from nfe_gateway.sefaz.environment import resolve_homologacao
from nfe_gateway.storage import ObjectNotFoundError, ObjectStore, build_object_store

logger = logging.getLogger("nfe_gateway.outbound_consumer")

CONSUMER_NAME = "nfe_gateway.outbound_consumer"
QUEUE_NAME = "nfe_gateway.transmission_requested"
ROUTING_KEY = "fiscal.document.transmission_requested.v1"
RESULT_ROUTING_KEY = "fiscal.document.transmission_result.v1"

CERTIFICATE_MISSING_MESSAGE = (
    "Empresa sem certificado A1 ativo. Cadastre o certificado em Configurações → Empresas para transmitir a nota."
)

PAYLOAD_MISSING_MESSAGE = (
    "O arquivo original da nota não está no armazenamento. Reenvie a nota pelo SAP."
)

CERTIFICATE_DNS_MESSAGE = (
    "Não foi possível buscar o certificado digital (falha de DNS). A nota não foi enviada à SEFAZ."
)

SERVICE_DNS_MESSAGE = (
    "Falha de DNS ao preparar o envio. A nota não chegou à SEFAZ."
)


NFSE_CREDENTIALS_MISSING_MESSAGE = (
    "Empresa sem usuário/senha do webservice municipal de NFS-e. Cadastre em Configurações → Empresas → NFS-e municipal."
)


def classify_transmission_error(exc: BaseException) -> tuple[str, str]:
    """Map a pre-SEFAZ failure to a code and a message safe to show on the note."""
    if isinstance(exc, ObjectNotFoundError) or _is_missing_object(exc):
        return "payload_not_found", PAYLOAD_MISSING_MESSAGE
    if is_name_resolution_error(exc):
        if isinstance(exc, BackendError):
            return "certificate_unreachable", CERTIFICATE_DNS_MESSAGE
        return "service_unreachable", SERVICE_DNS_MESSAGE
    if isinstance(exc, BackendError):
        code, detail = _problem_fields(exc.body)
        if code == "certificate_not_found" or (
            exc.status_code == 404 and "certificate" in (exc.body or "").lower()
        ):
            return "certificate_not_found", CERTIFICATE_MISSING_MESSAGE
        if code == "nfse_provider_credentials_not_found" or (
            exc.status_code == 404 and "nfse-provider-credentials" in (exc.body or "")
        ):
            return "provider_credentials_missing", detail or NFSE_CREDENTIALS_MISSING_MESSAGE
        if detail:
            return code or "backend_error", detail
        return code or "backend_error", str(exc)
    return "transmission_error", str(exc)


def _is_missing_object(exc: BaseException) -> bool:
    text = str(exc)
    return "NoSuchKey" in text or "specified key does not exist" in text.lower()


async def _attach_convenio_diagnosis(
    result: dict[str, Any],
    *,
    store: ObjectStore,
    pfx: bytes,
    payload_bytes: bytes,
    homologacao: bool,
) -> None:
    """On a CNC/IM rejection, append the município's convênio parameters
    (cached 24h per município/ambiente) to the message shown on the note."""
    if result.get("outcome") != "rejected" or not is_cnc_rejection(str(result.get("error_message") or "")):
        return
    try:
        municipio = emitter_municipality(json.loads(payload_bytes.decode("utf-8")))
        if not municipio:
            return
        convenio = await cached_convenio(store, codigo_municipio=municipio, pfx=pfx, homologacao=homologacao)
    except Exception as exc:  # noqa: BLE001 — diagnosis is best-effort
        logger.warning("nfse_convenio_diagnosis_failed", extra={"error": str(exc)})
        return
    diagnosis = diagnose_convenio(convenio)
    result["error_message"] = f"{result.get('error_message') or ''} | {diagnosis}".strip(" |")
    result["x_motivo"] = result["error_message"]


def _integration_destination(document_type: str, provider_code: str) -> str:
    if document_type != "nfse":
        return "sefaz"
    return "sefin" if provider_code == "sefin_nacional" else f"nfse_{provider_code}"


async def _transmit_nfse(
    data: dict[str, Any],
    *,
    organization_id: UUID,
    organization_company_id: UUID,
    backend: BackendClient,
    store: ObjectStore,
    force_homologacao: bool,
) -> tuple[dict[str, Any], str]:
    """NFS-e: escolhe o provedor municipal pelo evento e delega o protocolo.

    O Go resolve o provedor (catálogo nfse_municipal_providers + settings da
    empresa) e manda ``nfse_provider`` / ``nfse_provider_config``. Sem isso
    (eventos antigos) vale ``sefin_nacional``.
    """
    from nfe_gateway.nfse.providers.base import EmitRequest
    from nfe_gateway.nfse.providers.registry import get_provider

    provider = get_provider(data.get("nfse_provider"))
    config = data.get("nfse_provider_config") or {}
    if not isinstance(config, dict):
        config = {}
    caps = provider.capabilities(config)
    homologacao = resolve_homologacao(data["environment"], force_homologacao)

    payload_bytes = await store.get(data["payload_object_key"])
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return (
            {
                "outcome": "error",
                "error_code": "invalid_payload",
                "error_message": f"NFS-e payload is not valid JSON: {exc}",
            },
            provider.code,
        )

    pfx = None
    if caps.needs_certificate:
        material = await backend.get_signing_material(
            organization_id=organization_id, organization_company_id=organization_company_id
        )
        pfx = material.pfx
        del material
    credentials = None
    if caps.credentials != "none":
        credentials = await backend.get_nfse_credentials(
            organization_id=organization_id,
            organization_company_id=organization_company_id,
            provider_code=provider.code,
        )

    req = EmitRequest(
        payload=payload,
        homologacao=homologacao,
        document_id=str(data.get("document_id") or ""),
        config=config,
        pfx=pfx,
        credentials=credentials,
    )
    try:
        result = await asyncio.to_thread(provider.emit, req)
        if result.get("outcome") == "authorized" and hasattr(provider, "fetch_pdf"):
            try:
                pdf = await asyncio.to_thread(provider.fetch_pdf, result, req)
            except Exception as exc:  # noqa: BLE001 — PDF é best-effort
                logger.warning("nfse_pdf_download_failed", extra={"provider": provider.code, "error": str(exc)})
                pdf = None
            if pdf:
                result["pdf_bytes"] = pdf
        result.pop("_pdf_link", None)
        if provider.code == "sefin_nacional" and pfx:
            await _attach_convenio_diagnosis(
                result,
                store=store,
                pfx=pfx,
                payload_bytes=payload_bytes,
                homologacao=homologacao,
            )
    finally:
        req.pfx = None
        req.credentials = None
    return result, provider.code


def _problem_fields(body: str) -> tuple[str, str]:
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return "", ""
    if not isinstance(data, dict):
        return "", ""
    code = data.get("code")
    detail = data.get("detail")
    return (
        code if isinstance(code, str) else "",
        detail if isinstance(detail, str) else "",
    )


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

    if document_type == "nfse":
        try:
            result, provider_code = await _transmit_nfse(
                data,
                organization_id=organization_id,
                organization_company_id=organization_company_id,
                backend=backend,
                store=store,
                force_homologacao=force_homologacao,
            )
        except Exception as exc:  # noqa: BLE001 — publish so the note leaves "Autorizando"
            await _publish_transmission_error(broker, organization_id, document_id, exc)
            return
    else:
        provider_code = "sefaz"
        try:
            payload_bytes = await store.get(payload_object_key)
            material = await backend.get_signing_material(
                organization_id=organization_id, organization_company_id=organization_company_id
            )
        except Exception as exc:  # noqa: BLE001 — publish so the note leaves "Autorizando"
            await _publish_transmission_error(broker, organization_id, document_id, exc)
            return

        try:
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
            await _publish_transmission_error(broker, organization_id, document_id, exc)
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

    # PDF oficial do provedor municipal (quando não há XML nacional p/ DANFSe)
    pdf_key = None
    pdf_bytes = result.get("pdf_bytes")
    if pdf_bytes:
        pdf_key = f"{payload_object_key}.provider_pdf.pdf"
        await store.put(pdf_key, "application/pdf", pdf_bytes)

    dest = _integration_destination(document_type, provider_code)
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
            ibscbs=result.get("ibscbs"),
            provider_code=provider_code if document_type == "nfse" else None,
            pdf_url=result.get("pdf_url") or None,
            pdf_object_key=pdf_key,
            series=result.get("series") or None,
        ),
    )
    record_transmission_outcome(str(result.get("outcome") or "unknown"))


async def _publish_transmission_error(
    broker: Broker, organization_id: UUID, document_id: str, exc: BaseException
) -> None:
    error_code, error_message = classify_transmission_error(exc)
    logged = error_message
    if isinstance(exc, ObjectNotFoundError):
        logged = f"{error_message} key={exc.object_key}"
    logger.warning(
        "transmission failed document_id=%s error_code=%s error=%s",
        document_id,
        error_code,
        logged,
    )
    await broker.publish(
        RESULT_ROUTING_KEY,
        _result_envelope(
            organization_id,
            document_id,
            outcome="error",
            error_code=error_code,
            error_message=error_message,
        ),
    )
    record_transmission_outcome("error")


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
