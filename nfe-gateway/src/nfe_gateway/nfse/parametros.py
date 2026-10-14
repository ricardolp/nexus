"""ADN Parâmetros Municipais (mTLS A1) — convênio do município emissor.

Read-only GET /{codigoMunicipio}/convenio on the ADN parametrização host.
Results are cached in the shared object store (default 24h) so repeated
rejections or manual checks never hammer the Sistema Nacional for the same
município/ambiente.

Manual one-off check (uses the company's A1 from internal_api):

    python -m nfe_gateway.nfse.parametros \\
        --organization-id <uuid> --company-id <uuid> --municipio 2919553
"""

from __future__ import annotations

import json
import logging
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from nfe_gateway.nfse.sefin import _materialize_mtls_files, _shred
from nfe_gateway.storage import ObjectStore

logger = logging.getLogger("nfe_gateway.nfse.parametros")

PARAMETROS_PROD = "https://adn.nfse.gov.br/parametrizacao"
PARAMETROS_HOMOLOG = "https://adn.producaorestrita.nfse.gov.br/parametrizacao"

DEFAULT_CACHE_TTL = timedelta(hours=24)

_SIM_NAO = {"1": "sim", "0": "não", "-1": "indefinido"}
_TIPO_CONVENIO = {"1": "pleno", "2": "simplificado"}


def parametros_base_url(*, homologacao: bool) -> str:
    return PARAMETROS_HOMOLOG if homologacao else PARAMETROS_PROD


def _digits(value: str) -> str:
    return "".join(c for c in str(value or "") if c.isdigit())


def _flag(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def get_convenio(
    *,
    codigo_municipio: str,
    pfx: bytes,
    homologacao: bool,
    timeout: float = 30.0,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Single GET to ADN. 400/404 carry a ``mensagem`` body (município not found)."""
    codigo = _digits(codigo_municipio)
    if len(codigo) != 7:
        raise ValueError(f"codigo_municipio must be 7 IBGE digits, got {codigo_municipio!r}")
    url = f"{parametros_base_url(homologacao=homologacao)}/{codigo}/convenio"
    key_path, cert_path = _materialize_mtls_files(pfx)
    http = session or requests.Session()
    try:
        resp = http.get(
            url,
            headers={"Accept": "application/json"},
            cert=(str(cert_path), str(key_path)),
            timeout=timeout,
        )
    finally:
        _shred(key_path)
        _shred(cert_path)

    try:
        payload = resp.json()
    except ValueError:
        payload = {"raw": (resp.text or "")[:2000]}
    if not isinstance(payload, dict):
        payload = {"raw": str(payload)[:2000]}

    params = payload.get("parametrosConvenio") or {}
    tipo = params.get("tipoConvenio", params.get("tipoConvenioDeserializationSetter"))
    return {
        "codigo_municipio": codigo,
        "ambiente": "homologacao" if homologacao else "producao",
        "http_status": resp.status_code,
        "found": resp.status_code == 200 and bool(params),
        "mensagem": str(payload.get("mensagem") or payload.get("raw") or ""),
        "tipo_convenio": _flag(tipo),
        "aderente_ambiente_nacional": _flag(params.get("aderenteAmbienteNacional")),
        "aderente_emissor_nacional": _flag(params.get("aderenteEmissorNacional")),
        "emissao_padrao_contribuintes_rfb": _flag(params.get("situacaoEmissaoPadraoContribuintesRFB")),
        "aderente_man": _flag(params.get("aderenteMAN")),
    }


def diagnose_convenio(convenio: dict[str, Any]) -> str:
    """Short Portuguese explanation for the UI / operator."""
    amb = "homologação" if convenio.get("ambiente") == "homologacao" else "produção"
    mun = convenio.get("codigo_municipio") or "?"
    if not convenio.get("found"):
        detail = convenio.get("mensagem") or f"HTTP {convenio.get('http_status')}"
        return f"Município {mun} sem parâmetros de convênio no Sistema Nacional ({amb}): {detail}"

    rfb = convenio.get("emissao_padrao_contribuintes_rfb")
    emissor = convenio.get("aderente_emissor_nacional")
    tipo = convenio.get("tipo_convenio") or ""
    parts = [f"Convênio {mun} ({amb}):"]
    if tipo:
        parts.append(f"tipo {_TIPO_CONVENIO.get(tipo, tipo)},")
    parts += [
        f"emissor nacional {_SIM_NAO.get(emissor or '', emissor or '?')},",
        f"emissão padrão pelo CNPJ da RFB {_SIM_NAO.get(rfb or '', rfb or '?')}.",
    ]
    if emissor == "0":
        parts.append("O município não permite emissão pelos emissores públicos nacionais (API).")
    elif rfb == "0":
        parts.append(
            "O município exige que o prestador esteja habilitado no CNC NFS-e; "
            "a prefeitura precisa cadastrar/liberar a inscrição municipal neste ambiente."
        )
    elif rfb == "1":
        parts.append(
            "O município aceita emissão pelo cadastro da RFB; confira se a IM informada "
            "na DPS está correta ou se há bloqueio específico no CNC."
        )
    return " ".join(parts)


def is_cnc_rejection(error_message: str) -> bool:
    text = unicodedata.normalize("NFKD", error_message or "").encode("ascii", "ignore").decode().lower()
    return "cnc" in text or "nao esta autorizado a emitir" in text


def _cache_key(codigo_municipio: str, homologacao: bool) -> str:
    amb = "homologacao" if homologacao else "producao"
    return f"nfse/parametros_municipais/{amb}/{_digits(codigo_municipio)}/convenio.json"


async def _read_cache(
    store: ObjectStore, key: str, *, ttl: timedelta, now: datetime
) -> dict[str, Any] | None:
    try:
        cached = json.loads((await store.get(key)).decode("utf-8"))
        fetched_at = datetime.fromisoformat(cached["fetched_at"])
    except Exception:  # noqa: BLE001 — missing/corrupt cache is a miss
        return None
    if now - fetched_at > ttl:
        return None
    return cached


async def cached_convenio(
    store: ObjectStore,
    *,
    codigo_municipio: str,
    pfx: bytes,
    homologacao: bool,
    ttl: timedelta = DEFAULT_CACHE_TTL,
    use_cache: bool = True,
    now: datetime | None = None,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    import asyncio

    now = now or datetime.now(timezone.utc)
    key = _cache_key(codigo_municipio, homologacao)
    if use_cache:
        hit = await _read_cache(store, key, ttl=ttl, now=now)
        if hit is not None:
            return {**hit, "cached": True}

    result = await asyncio.to_thread(
        get_convenio,
        codigo_municipio=codigo_municipio,
        pfx=pfx,
        homologacao=homologacao,
        session=session,
    )
    result["fetched_at"] = now.isoformat()
    try:
        await store.put(key, "application/json", json.dumps(result, ensure_ascii=False).encode("utf-8"))
    except Exception as exc:  # noqa: BLE001 — cache write must not hide the answer
        logger.warning("nfse_convenio_cache_write_failed", extra={"error": str(exc)})
    return {**result, "cached": False}


def emitter_municipality(payload: dict[str, Any]) -> str:
    """Same precedence as the Go backend: prestador.codigo_municipio, else servico."""
    prestador = payload.get("prestador") or {}
    servico = payload.get("servico") or {}
    return _digits(prestador.get("codigo_municipio") or servico.get("codigo_municipio") or "")


async def _main(argv: list[str] | None = None) -> int:
    import argparse
    from uuid import UUID

    from nfe_gateway.backend_client import BackendClient
    from nfe_gateway.config import encryption_key_bytes, load_settings
    from nfe_gateway.oauth import TokenCache
    from nfe_gateway.storage import build_object_store

    parser = argparse.ArgumentParser(description="Consulta convênio municipal NFS-e (ADN, mTLS).")
    parser.add_argument("--organization-id", required=True, type=UUID)
    parser.add_argument("--company-id", required=True, type=UUID)
    parser.add_argument("--municipio", required=True, help="Código IBGE (7 dígitos)")
    parser.add_argument("--producao", action="store_true", help="Consultar produção (default: homologação)")
    parser.add_argument("--no-cache", action="store_true", help="Ignora o cache de 24h (faz a chamada)")
    args = parser.parse_args(argv)

    settings = load_settings()
    store = build_object_store(settings.storage_backend, settings.storage_local_path, encryption_key_bytes(settings))
    homologacao = not args.producao
    key = _cache_key(args.municipio, homologacao)
    if not args.no_cache:
        hit = await _read_cache(store, key, ttl=DEFAULT_CACHE_TTL, now=datetime.now(timezone.utc))
        if hit is not None:
            print(json.dumps({**hit, "cached": True}, ensure_ascii=False, indent=2))
            print(diagnose_convenio(hit))
            return 0

    backend = BackendClient(
        settings.backend_inbound_url,
        settings.backend_internal_url,
        settings.nfe_gateway_service_token,
        TokenCache(settings.backend_control_plane_url, None),  # type: ignore[arg-type]
    )
    material = await backend.get_signing_material(
        organization_id=args.organization_id, organization_company_id=args.company_id
    )
    try:
        result = await cached_convenio(
            store,
            codigo_municipio=args.municipio,
            pfx=material.pfx,
            homologacao=homologacao,
            use_cache=False,
        )
    finally:
        del material
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(diagnose_convenio(result))
    return 0


if __name__ == "__main__":
    import asyncio
    import sys

    sys.exit(asyncio.run(_main()))
