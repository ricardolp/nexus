"""Transporte do webservice IPM (Atende.Net).

POST ``multipart/form-data`` com o XML (uma nota por requisição), Basic Auth
(CPF/CNPJ + senha do portal) e cookie ``PHPSESSID`` reaproveitado entre
chamadas. O webservice é síncrono: uma requisição só depois que a anterior
terminar — por isso há um lock por (URL, usuário).

A IPM não reautentica um ``PHPSESSID`` vencido: devolve HTTP 401 com a página
"sessão encerrada por inatividade" e ignora o Basic Auth. Nesse caso o cookie
é descartado e a mesma nota é enviada de novo, uma única vez.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass

import requests

from nfe_gateway.nfse.providers.base import ProviderCredentials


class IpmTransportError(RuntimeError):
    """Timeout/conexão: o resultado vira ``retry`` (o identificador garante idempotência)."""


@dataclass
class IpmResponse:
    status_code: int
    content: bytes
    reason: str = ""


_sessions: dict[tuple[str, str], requests.Session] = {}
_locks: dict[tuple[str, str], threading.Lock] = {}
_registry_lock = threading.Lock()


def _key(url: str, username: str) -> tuple[str, str]:
    return (url.split("?")[0].lower(), username)


def _session_and_lock(url: str, creds: ProviderCredentials) -> tuple[requests.Session, threading.Lock]:
    key = _key(url, creds.username)
    with _registry_lock:
        session = _sessions.get(key)
        if session is None:
            session = requests.Session()
            session.auth = (creds.username, creds.password)
            _sessions[key] = session
        else:
            session.auth = (creds.username, creds.password)
        lock = _locks.setdefault(key, threading.Lock())
    return session, lock


def _stale_session(status_code: int, content: bytes) -> bool:
    """Página de login da IPM no lugar do XML — o PHPSESSID venceu."""
    sample = (content or b"")[:8000].lower()
    if b"inatividade" in sample or b"realize login novamente" in sample:
        return True
    if status_code != 401:
        return False
    head = sample.lstrip()[:20]
    return head.startswith(b"<!doctype") or head.startswith(b"<html")


def _post_once(
    http: requests.Session, *, url: str, xml: bytes, timeout: float, file_field: str
) -> requests.Response:
    return http.post(
        url,
        files={file_field: ("nfse.xml", xml, "text/xml")},
        timeout=timeout,
    )


def post_xml(
    *,
    url: str,
    xml: bytes,
    credentials: ProviderCredentials,
    timeout: float = 60.0,
    file_field: str = "file",
    session: requests.Session | None = None,
) -> IpmResponse:
    http, lock = (session, threading.Lock()) if session is not None else _session_and_lock(url, credentials)
    if session is not None:
        http.auth = (credentials.username, credentials.password)
    with lock:
        try:
            resp = _post_once(http, url=url, xml=xml, timeout=timeout, file_field=file_field)
            if _stale_session(resp.status_code, resp.content or b""):
                http.cookies.clear()
                resp = _post_once(http, url=url, xml=xml, timeout=timeout, file_field=file_field)
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise IpmTransportError(f"IPM não respondeu ({exc.__class__.__name__})") from exc
    return IpmResponse(status_code=resp.status_code, content=resp.content or b"", reason=str(resp.reason or ""))


def download_pdf(
    *,
    url: str,
    link: str,
    credentials: ProviderCredentials,
    timeout: float = 30.0,
    session: requests.Session | None = None,
) -> bytes | None:
    """Baixa o PDF oficial (``link_nfse``). Best-effort: None se não for PDF."""
    if not link.lower().startswith("https://"):
        return None
    http, lock = (session, threading.Lock()) if session is not None else _session_and_lock(url, credentials)
    with lock:
        try:
            resp = http.get(link, timeout=timeout)
        except requests.RequestException:
            return None
    content = resp.content or b""
    if resp.status_code == 200 and content.startswith(b"%PDF"):
        return content
    return None
