"""SEFIN Nacional HTTP client (mTLS A1)."""

from __future__ import annotations

import base64
import gzip
import json
import tempfile
from pathlib import Path
from typing import Any

import requests
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, pkcs12

SEFIN_PROD = "https://sefin.nfse.gov.br/SefinNacional"
SEFIN_HOMOLOG = "https://sefin.producaorestrita.nfse.gov.br/SefinNacional"


def sefin_base_url(*, homologacao: bool) -> str:
    return SEFIN_HOMOLOG if homologacao else SEFIN_PROD


def gzip_b64(data: bytes) -> str:
    return base64.b64encode(gzip.compress(data)).decode("ascii")


def gunzip_b64(data: str) -> bytes:
    return gzip.decompress(base64.b64decode(data))


def _materialize_mtls_files(pfx: bytes) -> tuple[Path, Path]:
    """Write PEM key+cert for requests mTLS (password-less PFX from Nexus)."""
    key, cert, _chain = pkcs12.load_key_and_certificates(pfx, None)
    if key is None or cert is None:
        raise ValueError("PFX missing private key or certificate")
    key_pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    cert_pem = cert.public_bytes(Encoding.PEM)
    key_path = Path(tempfile.mkstemp(prefix="nfse_key_", suffix=".pem")[1])
    cert_path = Path(tempfile.mkstemp(prefix="nfse_cert_", suffix=".pem")[1])
    key_path.write_bytes(key_pem)
    cert_path.write_bytes(cert_pem)
    return key_path, cert_path


def _shred(path: Path) -> None:
    try:
        if path.exists():
            path.write_bytes(b"\x00" * path.stat().st_size)
            path.unlink(missing_ok=True)
    except OSError:
        pass


def _lookup(data: dict[str, Any], *keys: str) -> str:
    lowered = {str(k).lower(): v for k, v in data.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _format_sefin_errors(payload: Any, *, fallback: str) -> tuple[str, str]:
    """Return (codigo, mensagem) from a SEFIN JSON error body."""
    if not isinstance(payload, dict):
        text = str(payload or "").strip() or fallback
        return "", text

    erros = payload.get("erros") or payload.get("errors") or payload.get("alertas") or []
    if isinstance(erros, dict):
        erros = [erros]
    parts: list[str] = []
    codigo = ""
    if isinstance(erros, list):
        for item in erros:
            if not isinstance(item, dict):
                text = str(item).strip()
                if text:
                    parts.append(text)
                continue
            item_code = _lookup(item, "codigo", "code")
            item_desc = _lookup(item, "descricao", "mensagem", "message", "detail")
            complemento = _lookup(item, "complemento", "correcao")
            if item_code and not codigo:
                codigo = item_code
            if item_desc and complemento and complemento not in item_desc:
                parts.append(f"{item_desc} ({complemento})")
            elif item_desc:
                parts.append(item_desc)
            elif complemento:
                parts.append(complemento)
            elif item_code:
                parts.append(item_code)

    mensagem = " | ".join(parts) or _lookup(payload, "mensagem", "message", "descricao", "detail")
    if not codigo:
        codigo = _lookup(payload, "codigo", "code")
    if not mensagem:
        raw = payload.get("raw")
        if isinstance(raw, str) and raw.strip():
            mensagem = raw.strip()[:2000]
        else:
            try:
                dumped = json.dumps(payload, ensure_ascii=False)
            except TypeError:
                dumped = ""
            mensagem = dumped[:2000] if dumped and dumped not in ("{}", "[]") else fallback
    return codigo, mensagem or fallback


def post_dps(
    *,
    signed_xml: bytes,
    pfx: bytes,
    homologacao: bool,
    timeout: float = 60.0,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """POST signed DPS to SEFIN. Returns normalized outcome dict."""
    url = f"{sefin_base_url(homologacao=homologacao).rstrip('/')}/nfse"
    body = {"dpsXmlGZipB64": gzip_b64(signed_xml)}
    key_path, cert_path = _materialize_mtls_files(pfx)
    http = session or requests.Session()
    try:
        resp = http.post(
            url,
            data=json.dumps(body),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            cert=(str(cert_path), str(key_path)),
            timeout=timeout,
        )
    finally:
        _shred(key_path)
        _shred(cert_path)

    try:
        payload = resp.json()
    except ValueError:
        payload = {"raw": resp.text}

    if resp.status_code in (200, 201):
        nfse_b64 = payload.get("nfseXmlGZipB64") or payload.get("nfseXmlGZipB64".lower())
        nfse_xml = b""
        if nfse_b64:
            try:
                nfse_xml = gunzip_b64(nfse_b64)
            except Exception:  # noqa: BLE001
                nfse_xml = b""
        return {
            "outcome": "authorized",
            "access_key": str(payload.get("chaveAcesso") or payload.get("chave_acesso") or ""),
            "protocol": str(payload.get("idDps") or payload.get("id_dps") or ""),
            "number": str(payload.get("numero") or payload.get("nNFSe") or ""),
            "verification_code": str(payload.get("codigoVerificacao") or payload.get("codigo_verificacao") or ""),
            "cstat": "100",
            "x_motivo": "NFS-e autorizada",
            "response_xml": nfse_xml or resp.content,
            "signed_xml": signed_xml,
            "http_status": resp.status_code,
            "raw": payload,
        }

    codigo, mensagem = _format_sefin_errors(payload, fallback=str(resp.reason or f"HTTP {resp.status_code}"))
    if not codigo:
        codigo = str(resp.status_code)

    return {
        "outcome": "rejected" if 400 <= resp.status_code < 500 else "error",
        "error_code": codigo,
        "error_message": str(mensagem),
        "cstat": codigo,
        "x_motivo": str(mensagem),
        "response_xml": resp.content,
        "signed_xml": signed_xml,
        "http_status": resp.status_code,
        "raw": payload,
    }


def post_evento(
    *,
    chave: str,
    signed_xml: bytes,
    pfx: bytes,
    homologacao: bool,
    timeout: float = 60.0,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """POST signed pedRegEvento to SEFIN. Returns normalized event outcome dict."""
    chave_digits = "".join(c for c in chave if c.isalnum()).upper()
    url = f"{sefin_base_url(homologacao=homologacao).rstrip('/')}/nfse/{chave_digits}/eventos"
    body = {"pedidoRegistroEventoXmlGZipB64": gzip_b64(signed_xml)}
    key_path, cert_path = _materialize_mtls_files(pfx)
    http = session or requests.Session()
    try:
        resp = http.post(
            url,
            data=json.dumps(body),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            cert=(str(cert_path), str(key_path)),
            timeout=timeout,
        )
    finally:
        _shred(key_path)
        _shred(cert_path)

    try:
        payload = resp.json()
    except ValueError:
        payload = {"raw": resp.text}

    if resp.status_code in (200, 201):
        evento_b64 = payload.get("eventoXmlGZipB64") or payload.get("eventoxmlgzipb64")
        evento_xml = b""
        if evento_b64:
            try:
                evento_xml = gunzip_b64(str(evento_b64))
            except Exception:  # noqa: BLE001
                evento_xml = b""
        return {
            "outcome": "accepted",
            "event_kind": "cancel",
            "access_key": chave_digits,
            "protocol": str(payload.get("idEvento") or payload.get("id_evento") or ""),
            "cstat": "135",
            "x_motivo": "Evento registrado e vinculado a NFS-e",
            "response_xml": evento_xml or resp.content,
            "signed_xml": signed_xml,
            "http_status": resp.status_code,
            "raw": payload,
        }

    codigo, mensagem = _format_sefin_errors(payload, fallback=str(resp.reason or f"HTTP {resp.status_code}"))
    if not codigo:
        codigo = str(resp.status_code)

    return {
        "outcome": "rejected" if 400 <= resp.status_code < 500 else "error",
        "event_kind": "cancel",
        "error_code": codigo,
        "error_message": str(mensagem),
        "cstat": codigo,
        "x_motivo": str(mensagem),
        "response_xml": resp.content,
        "signed_xml": signed_xml,
        "http_status": resp.status_code,
        "raw": payload,
    }
