"""Thin boundary around PyNFe so the workers depend on this interface, not on
PyNFe's API shape directly — same reasoning as the Go side's
`fiscal.Provider` interface (internal/fiscal/provider.go): swap the
implementation (stub for tests, real PyNFe against homologação/produção)
without touching the workers.

## How Key Vault-backed signing actually works here

No fork or monkeypatch of PyNFe is needed for this. Confirmed by reading the
library's actual source (pynfe/entidades/certificado.py,
pynfe/processamento/{assinatura,comunicacao}.py, TadaSoftware/PyNFe@main):

- `CertificadoA1(caminho_arquivo)` always reads its PFX from a filesystem
  path (`open(self.caminho_arquivo, "rb")`) — there is no bytes-accepting
  constructor. PyNFe was already written assuming "any local cert, however
  it got there" — a smart card, a mounted secrets volume, whatever. Key
  Vault-backed signing is satisfied the same way any of those would be: we
  materialize the PFX the backend hands us (see backend_client.py —
  always password-less, see below) as one short-lived local file right
  before the call, via `ephemeral_pfx_path` below, and delete it
  immediately after. This is not a workaround forced by our architecture;
  it's the library's normal usage pattern.
- The backend's signing-material endpoint always returns a **password-less**
  PFX (both CertificateStore implementations guarantee this — see
  backend/internal/platform/keyvault/{keyvault,local}.go) — pass
  `senha=""` to PyNFe, never the original import password (which this
  service never even receives).
- PyNFe derives from that one file path in two independent places per
  authorization, and only one of them touches disk further:
  - `AssinaturaA1` (XML digital signature) loads the key/cert fully
    in-memory (`CertificadoA1.separar_arquivo(senha)`, default
    `caminho=False` — returns PEM bytes directly) and signs via `signxml`.
    No extra temp file.
  - `ComunicacaoSefaz._post` (the actual SOAP/HTTPS call) uses
    `separar_arquivo(senha, caminho=True)`, because `requests`' `cert=`
    parameter for mTLS needs real file paths, not bytes — this writes a
    *second*, PyNFe-owned pair of temp files (an unencrypted PEM private
    key!) via `tempfile.NamedTemporaryFile(delete=False)`. PyNFe cleans
    these up itself in a `try/finally: certificado_a1.excluir()` around
    every `_post` call — confirmed in source, so this is not a leak, just a
    brief on-disk window during each request.
  - Both temp-file windows (ours and PyNFe's own) are covered by pointing
    `TMPDIR` at a tmpfs/ramdisk (e.g. `/dev/shm`) in deployment — Python's
    `tempfile` module reads `TMPDIR` automatically, so this is one line of
    process config, nothing to change in code.
- **Known gap worth hardening later, not required to make this work**:
  every `_post`/`_post_https` in `pynfe/processamento/comunicacao.py` calls
  `requests.post(..., verify=False, ...)` — PyNFe never validates SEFAZ's
  TLS server certificate, for any UF or document type. The NF-e body is
  separately signed and SEFAZ validates that signature independently, so
  this isn't a payload-integrity hole, but it does mean a network-level
  attacker could intercept/redirect the connection undetected. Fixing it
  without forking the whole package: subclass `ComunicacaoSefaz` and
  override `_post` (it only touches `self.uf`/`self.certificado`/
  `self.certificado_senha`, all public constructor attributes — safe to
  override), copying the ~20 lines of `_post` with `verify=True`. Worth
  raising upstream too.

consult_distribution is now wired to the real PyNFe call
(ComunicacaoSefaz.consulta_distribuicao, confirmed against the pinned
pynfe==0.6.5 source — pynfe/processamento/comunicacao.py — not guessed):
it POSTs `distDFeInt`/`distNSU` with the resolved cnpj/last_nsu, over mTLS
using the ephemeral cert file, and returns a raw `requests.Response`; this
module parses that SOAP body via sefaz.distribution.parse_distribution_response.
transmit_nfe (NF-e authorization, outbound) is still unimplemented — it's a
separate PyNFe call site (`autorizacao`) that this pass didn't need, since
only the inbound distribution flow was in scope. See
docs/architecture/22_nfe_gateway_service.md, "Próximos passos".
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import tempfile
from abc import ABC, abstractmethod

from lxml import etree
from pynfe.processamento.assinatura import AssinaturaA1
from pynfe.processamento.comunicacao import ComunicacaoSefaz

from nfe_gateway.sefaz.distribution import (
    DistributionResult,
    SefazResponseError,
    parse_distribution_response,
)
from nfe_gateway.sefaz.environment import HOMOLOGACAO_DISCLAIMER, resolve_homologacao
from nfe_gateway.sefaz.manifestation import EventoResult, build_ciencia_evento, parse_evento_response
from nfe_gateway.sefaz.tls_comunicacao import ComunicacaoSefazVerified

# Prefer TLS-verified transport; fall back only if subclass import fails at runtime.
Comunicacao = ComunicacaoSefazVerified


class SefazClient(ABC):
    @abstractmethod
    async def consult_distribution(
        self,
        *,
        uf: str,
        environment: str,
        cnpj: str,
        pfx: bytes,
        last_nsu: int = 0,
        chave: str | None = None,
        consulta_nsu_especifico: bool = False,
    ) -> DistributionResult: ...

    @abstractmethod
    async def transmit_nfe(
        self,
        *,
        uf: str,
        environment: str,
        pfx: bytes,
        payload_bytes: bytes,
        content_type: str = "application/json",
    ) -> dict: ...

    @abstractmethod
    async def submit_ciencia(
        self, *, uf: str, environment: str, cnpj: str, pfx: bytes, chave: str
    ) -> EventoResult: ...


@contextlib.contextmanager
def ephemeral_pfx_path(pfx: bytes):
    """The one local file PyNFe's CertificadoA1 needs — written, handed
    back as a path, then shredded + deleted on the way out, mirroring the
    Go side's `defer zeroBytes(...)` on the PFX buffer
    (internal/certificate/service.go). Point TMPDIR at a tmpfs (e.g.
    /dev/shm) in deployment so this — and PyNFe's own derived temp files,
    see the module docstring — never actually touches persistent disk.
    """
    fd, path = tempfile.mkstemp(prefix="nfe-gw-cert-", suffix=".pfx")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(pfx)
        yield path
    finally:
        try:
            size = os.path.getsize(path)
            with open(path, "r+b") as f:
                f.write(b"\x00" * size)
        except OSError:
            pass
        os.unlink(path)


class PyNfeSefazClient(SefazClient):
    """Real implementation. The certificate handoff (ephemeral_pfx_path +
    senha="") and the distribution query are both wired to real PyNFe now —
    see the module docstring. transmit_nfe (outbound authorization) is not.

    force_homologacao (from settings.sefaz_force_homologacao, default True)
    is resolved against the caller-supplied environment via
    sefaz.environment.resolve_homologacao — see that module for why this is
    two independent signals, not one: it's passed as ComunicacaoSefaz's
    `homologacao` kwarg below, never `environment == "..."` directly, so a
    misconfigured or prematurely-flipped company record can't reach
    produção on its own.
    """

    def __init__(self, force_homologacao: bool = True):
        self.force_homologacao = force_homologacao

    async def consult_distribution(
        self,
        *,
        uf: str,
        environment: str,
        cnpj: str,
        pfx: bytes,
        last_nsu: int = 0,
        chave: str | None = None,
        consulta_nsu_especifico: bool = False,
    ) -> DistributionResult:
        """last_nsu/chave/consulta_nsu_especifico map straight onto PyNFe's
        own three query modes (distNSU/consNSU/consChNFe — see
        ComunicacaoSefaz.consulta_distribuicao's docstring, confirmed against
        pynfe==0.6.5 source): the background distribution_poller only ever
        uses the distNSU mode (last_nsu forward, chave=None), while the
        on-demand query_worker (consulta por NSU específico / por chave /
        lote de chaves, triggered from the fiscal documents screen) uses all
        three through this same method — no separate PyNFe integration
        needed for those.
        """
        homologacao = resolve_homologacao(environment, self.force_homologacao)
        with ephemeral_pfx_path(pfx) as cert_path:
            comunicacao = Comunicacao(uf, cert_path, "", homologacao=homologacao)
            # consulta_distribuicao is a blocking `requests.post` call (PyNFe
            # has no async surface) — off the event loop via to_thread so it
            # doesn't stall every other company's poll while this one is
            # in flight. cert_path/comunicacao must stay alive until this
            # returns, hence the await still being inside the `with`.
            response = await asyncio.to_thread(
                comunicacao.consulta_distribuicao,
                cnpj=cnpj,
                chave=chave,
                nsu=last_nsu,
                consulta_nsu_especifico=consulta_nsu_especifico,
            )
        if response.status_code >= 300:
            raise SefazResponseError(
                f"SEFAZ distribution HTTP {response.status_code}: {response.text[:500]}"
            )
        return parse_distribution_response(response.content)

    async def transmit_nfe(
        self,
        *,
        uf: str,
        environment: str,
        pfx: bytes,
        payload_bytes: bytes,
        content_type: str = "application/json",
    ) -> dict:
        """Transmit NF-e to SEFAZ for authorization.
        
        Args:
            uf: UF code (e.g. "SP")
            environment: "production" or "homologation"
            pfx: PFX certificate bytes (password-less)
            payload_bytes: Either SAP JSON or raw NF-e XML bytes
            content_type: "application/json" or "application/xml"
            
        Returns:
            dict with:
                outcome: "authorized" | "rejected"
                protocol: Protocol number if authorized
                access_key: NF-e access key (chave) if authorized
                cstat: SEFAZ cStat code
                x_motivo: SEFAZ message
                error_code: Optional error classification
                error_message: Human-readable error
                response_xml: bytes of nfeProc or SEFAZ response
                signed_xml: bytes of signed XML (before transmission)
        """
        from nfe_gateway.sefaz.sap_nfe import SapNfeMapperError, build_unsigned_xml
        from nfe_gateway.sefaz.xsd_validate import XSDValidationError, validate_signed_nfe_xml, validate_unsigned_nfe_xml
        
        homologacao = resolve_homologacao(environment, self.force_homologacao)
        
        # Step 1: Build unsigned XML
        try:
            if content_type == "application/json":
                import json
                sap_json = json.loads(payload_bytes.decode("utf-8"))
                unsigned_xml = build_unsigned_xml(sap_json, homologacao=homologacao)
            else:
                # Already XML
                unsigned_xml = etree.fromstring(payload_bytes)
        except (ValueError, SapNfeMapperError) as exc:
            return {
                "outcome": "rejected",
                "error_code": "mapper_error",
                "error_message": str(exc),
                "response_xml": b"",
            }
        
        # Step 2: Soft XSD/structure validation (unsigned)
        try:
            validate_unsigned_nfe_xml(unsigned_xml)
        except XSDValidationError as exc:
            return {
                "outcome": "rejected",
                "error_code": "xsd_validation",
                "error_message": str(exc),
                "response_xml": b"",
            }
        
        # Step 3: Sign XML — keep the exact signed string for transmission
        signed_xml_element = None
        signed_xml_str = ""
        signed_xml_bytes = b""
        try:
            from nfe_gateway.sefaz.assinatura import assinar_nfe

            with ephemeral_pfx_path(pfx) as cert_path:
                signed_xml_str = assinar_nfe(unsigned_xml, cert_path, "")
                signed_xml_element = etree.fromstring(signed_xml_str)
                signed_xml_bytes = (
                    b'<?xml version="1.0" encoding="UTF-8"?>'
                    + etree.tostring(signed_xml_element, encoding="utf-8")
                )
        except Exception as exc:
            return {
                "outcome": "rejected",
                "error_code": "signing_error",
                "error_message": f"Failed to sign XML: {exc}",
                "response_xml": b"",
            }
        
        # Step 4: Validate signed XML structure
        try:
            validate_signed_nfe_xml(signed_xml_element)
        except XSDValidationError as exc:
            return {
                "outcome": "rejected",
                "error_code": "xsd_validation_signed",
                "error_message": str(exc),
                "response_xml": b"",
                "signed_xml": signed_xml_bytes,
            }
        
        # Step 5: Transmit to SEFAZ (contingency routing from SAP tpEmis)
        from nfe_gateway.sefaz.contingency import autorizacao_contingencia_flag, resolve_tp_emis

        sap_for_tp: dict = {}
        if content_type == "application/json":
            import json as _json

            try:
                sap_for_tp = _json.loads(payload_bytes.decode("utf-8"))
            except Exception:
                sap_for_tp = {}
        tp_emis = resolve_tp_emis(sap_for_tp) if sap_for_tp else 1
        contingencia = autorizacao_contingencia_flag(tp_emis)

        try:
            result = await self._transmit_to_sefaz(
                uf=uf,
                pfx=pfx,
                homologacao=homologacao,
                signed_xml=signed_xml_element,
                signed_xml_str=signed_xml_str,
                contingencia=contingencia,
            )
            result["signed_xml"] = signed_xml_bytes
            result["tp_emis"] = tp_emis
            return result
        except Exception as exc:
            return {
                "outcome": "rejected",
                "error_code": "sefaz_error",
                "error_message": f"SEFAZ transmission failed: {exc}",
                "response_xml": b"",
                "signed_xml": signed_xml_bytes,
            }
    
    async def _transmit_to_sefaz(
        self,
        *,
        uf: str,
        pfx: bytes,
        homologacao: bool,
        signed_xml: etree._Element,
        signed_xml_str: str,
        contingencia: bool = False,
    ) -> dict:
        """Transmit signed NF-e using the exact signed string (avoid cStat 297).

        PyNFe ``autorizacao`` re-serializes the signed element inside SOAP via
        lxml, which frequently changes namespace prefixes / xmlns placement and
        breaks the digest SEFAZ recalculates. We POST a hand-built envelope
        that embeds ``signed_xml_str`` verbatim, then interpret the response
        the same way as a ``(1, response, nota)`` PyNFe tuple.
        """
        from nfe_gateway.sefaz.autorizacao_soap import build_nfe_autorizacao_soap

        soap = build_nfe_autorizacao_soap(signed_xml_str, id_lote=1, ind_sinc=1)

        with ephemeral_pfx_path(pfx) as cert_path:
            comunicacao = Comunicacao(uf, cert_path, "", homologacao=homologacao)
            url = comunicacao._get_url(
                modelo="nfe", consulta="AUTORIZACAO", contingencia=contingencia
            )
            response = await asyncio.to_thread(comunicacao._post, url, soap, 60)

        # Shape compatible with _interpret_autorizacao_result's (1, response, nota) path
        raw = (1, response, signed_xml)
        return await self._interpret_autorizacao_result(
            raw,
            uf=uf,
            pfx=pfx,
            homologacao=homologacao,
            contingencia=contingencia,
        )

    async def _interpret_autorizacao_result(
        self,
        raw: tuple,
        *,
        uf: str,
        pfx: bytes,
        homologacao: bool,
        contingencia: bool = False,
    ) -> dict:
        if not isinstance(raw, tuple) or not raw:
            raise SefazResponseError(f"Unexpected autorizacao return type: {type(raw)!r}")

        flag = raw[0]
        if flag == 0 and len(raw) == 2:
            # Authorized: (0, nfeProc Element)
            nfe_proc = raw[1]
            xml_bytes = _as_xml_bytes(nfe_proc)
            root = nfe_proc if hasattr(nfe_proc, "iter") else etree.fromstring(xml_bytes)
            cstat = _find_local_text(root, "cStat") or "100"
            x_motivo = _find_local_text(root, "xMotivo") or "Autorizado o uso da NF-e"
            return {
                "outcome": "authorized",
                "protocol": _find_local_text(root, "nProt"),
                "access_key": _find_local_text(root, "chNFe"),
                "cstat": cstat,
                "x_motivo": x_motivo,
                "response_xml": xml_bytes,
            }

        if flag == 0 and len(raw) >= 2 and isinstance(raw[1], str):
            # Async recibo: (0, nRec, nota)
            return await self._poll_recibo(
                uf=uf,
                pfx=pfx,
                homologacao=homologacao,
                recibo=raw[1],
                contingencia=contingencia,
            )

        # Rejection / other: (1, requests.Response, nota) or similar
        response = raw[1] if len(raw) > 1 else None
        nota = raw[2] if len(raw) > 2 else None
        if response is not None and hasattr(response, "status_code"):
            if response.status_code >= 300:
                raise SefazResponseError(
                    f"SEFAZ autorizacao HTTP {response.status_code}: {response.text[:500]}"
                )
            xml_bytes = _as_xml_bytes(response)
        else:
            xml_bytes = _as_xml_bytes(response)

        root = etree.fromstring(xml_bytes)
        from nfe_gateway.sefaz.autorizacao_result import (
            DUPLICIDADE_CSTAT,
            build_nfe_proc,
            extract_access_key_from_nfe,
            parse_autorizacao_or_recibo_xml,
        )

        parsed = parse_autorizacao_or_recibo_xml(root)

        if parsed.outcome == "poll_recibo":
            if not parsed.recibo:
                raise SefazResponseError("cStat 103/104 but no nRec in response")
            return await self._poll_recibo(
                uf=uf,
                pfx=pfx,
                homologacao=homologacao,
                recibo=parsed.recibo,
                contingencia=contingencia,
            )

        if parsed.outcome == "authorized":
            proc_xml = build_nfe_proc(nota, parsed.prot_nfe) or xml_bytes
            return {
                "outcome": "authorized",
                "protocol": parsed.protocol,
                "access_key": parsed.access_key,
                "cstat": parsed.cstat,
                "x_motivo": parsed.x_motivo,
                "lote_cstat": parsed.lote_cstat,
                "response_xml": proc_xml,
            }

        if parsed.cstat == DUPLICIDADE_CSTAT:
            chave = parsed.access_key or extract_access_key_from_nfe(
                nota if hasattr(nota, "iter") else None
            )
            recovered = await self._recover_from_duplicidade(
                uf=uf,
                pfx=pfx,
                homologacao=homologacao,
                contingencia=contingencia,
                chave=chave,
                nota=nota if hasattr(nota, "iter") else None,
            )
            if recovered is not None:
                return recovered

        return {
            "outcome": "rejected",
            "cstat": parsed.cstat,
            "x_motivo": parsed.x_motivo,
            "protocol": parsed.protocol,
            "access_key": parsed.access_key,
            "lote_cstat": parsed.lote_cstat,
            "error_message": f"SEFAZ rejected: {parsed.cstat} - {parsed.x_motivo}",
            "response_xml": xml_bytes,
        }

    async def _recover_from_duplicidade(
        self,
        *,
        uf: str,
        pfx: bytes,
        homologacao: bool,
        contingencia: bool,
        chave: str | None,
        nota: etree._Element | None,
    ) -> dict | None:
        """cStat 204: NF-e already authorized — consulta por chave for protocol/nfeProc.

        Returns an ``authorized`` result dict when consulta confirms 100/150;
        ``None`` if chave is missing or consulta does not confirm authorization
        (caller keeps the original 204 rejection, or uses a richer reject).
        """
        if not chave:
            return None
        digits = "".join(ch for ch in chave if ch.isdigit())
        if len(digits) != 44:
            return None

        with ephemeral_pfx_path(pfx) as cert_path:
            comunicacao = Comunicacao(uf, cert_path, "", homologacao=homologacao)
            response = await asyncio.to_thread(
                comunicacao.consulta_nota,
                "nfe",
                digits,
                contingencia,
            )

        if getattr(response, "status_code", 200) >= 300:
            return None

        xml_bytes = _as_xml_bytes(response)
        if not xml_bytes:
            return None

        root = etree.fromstring(xml_bytes)
        from nfe_gateway.sefaz.autorizacao_result import (
            build_nfe_proc,
            parse_consulta_situacao_xml,
        )

        parsed = parse_consulta_situacao_xml(root)
        if parsed.outcome != "authorized":
            # Cancelled / denegada / unknown — surface consulta status instead of bare 204.
            if parsed.cstat:
                return {
                    "outcome": "rejected",
                    "cstat": parsed.cstat,
                    "x_motivo": parsed.x_motivo,
                    "protocol": parsed.protocol,
                    "access_key": parsed.access_key or digits,
                    "error_message": (
                        f"SEFAZ duplicidade (204); consulta situacao: "
                        f"{parsed.cstat} - {parsed.x_motivo}"
                    ),
                    "response_xml": xml_bytes,
                    "recovered_from_duplicidade": True,
                }
            return None

        proc_xml = build_nfe_proc(nota, parsed.prot_nfe) or xml_bytes
        return {
            "outcome": "authorized",
            "protocol": parsed.protocol,
            "access_key": parsed.access_key or digits,
            "cstat": parsed.cstat,
            "x_motivo": parsed.x_motivo,
            "response_xml": proc_xml,
            "recovered_from_duplicidade": True,
        }

    async def _poll_recibo(
        self,
        *,
        uf: str,
        pfx: bytes,
        homologacao: bool,
        recibo: str,
        contingencia: bool = False,
    ) -> dict:
        """Poll consulta_recibo. Exhausted retries → waiting_recibo (not rejected).

        ``consulta_recibo`` returns a ``requests.Response`` (unlike ``autorizacao``).
        """
        wait_times = [2, 2, 3, 4, 5, 6, 7, 8, 9, 10]

        for wait in wait_times:
            await asyncio.sleep(wait)

            with ephemeral_pfx_path(pfx) as cert_path:
                comunicacao = Comunicacao(uf, cert_path, "", homologacao=homologacao)
                response = await asyncio.to_thread(
                    comunicacao.consulta_recibo,
                    modelo="nfe",
                    numero=recibo,
                    contingencia=contingencia,
                )

            if getattr(response, "status_code", 200) >= 300:
                continue

            xml_bytes = _as_xml_bytes(response)
            root = etree.fromstring(xml_bytes)
            from nfe_gateway.sefaz.autorizacao_result import parse_autorizacao_or_recibo_xml

            parsed = parse_autorizacao_or_recibo_xml(root)

            if parsed.outcome == "processing":
                continue
            if parsed.outcome == "authorized":
                return {
                    "outcome": "authorized",
                    "protocol": parsed.protocol,
                    "access_key": parsed.access_key,
                    "cstat": parsed.cstat,
                    "x_motivo": parsed.x_motivo,
                    "lote_cstat": parsed.lote_cstat,
                    "response_xml": xml_bytes,
                    "receipt": recibo,
                }
            if parsed.outcome == "poll_recibo":
                # Still waiting / unexpected — keep polling same recibo
                continue

            from nfe_gateway.sefaz.autorizacao_result import DUPLICIDADE_CSTAT

            if parsed.cstat == DUPLICIDADE_CSTAT and parsed.access_key:
                recovered = await self._recover_from_duplicidade(
                    uf=uf,
                    pfx=pfx,
                    homologacao=homologacao,
                    contingencia=contingencia,
                    chave=parsed.access_key,
                    nota=None,
                )
                if recovered is not None:
                    recovered = {**recovered, "receipt": recibo}
                    return recovered

            return {
                "outcome": "rejected",
                "cstat": parsed.cstat,
                "x_motivo": parsed.x_motivo,
                "protocol": parsed.protocol,
                "access_key": parsed.access_key,
                "lote_cstat": parsed.lote_cstat,
                "error_message": f"SEFAZ rejected: {parsed.cstat} - {parsed.x_motivo}",
                "response_xml": xml_bytes,
                "receipt": recibo,
            }

        return {
            "outcome": "waiting_recibo",
            "error_code": "recibo_timeout",
            "error_message": "Max recibo polling attempts exhausted; SEFAZ still processing",
            "receipt": recibo,
            "response_xml": b"",
        }

    async def submit_ciencia(
        self, *, uf: str, environment: str, cnpj: str, pfx: bytes, chave: str
    ) -> EventoResult:
        """Ciência da Operação only (tp_evento 210210) — see
        sefaz/manifestation.py's module docstring for why the other three
        manifestação outcomes (Confirmação/Desconhecimento/Operação não
        Realizada) are deliberately not exposed here. Same
        build→sign→POST shape as consult_distribution, using
        AssinaturaA1 (XML digital signature, in-memory — see this module's
        docstring on how PyNFe consumes a Key-Vault-backed cert) instead of
        consulta_distribuicao's unsigned request; ComunicacaoSefaz.evento
        itself picks the AN endpoint for any tpEvento starting with "2"
        (confirmed reading pynfe/processamento/comunicacao.py), so `modelo`
        below only matters for a fallback branch this call never hits."""
        homologacao = resolve_homologacao(environment, self.force_homologacao)
        unsigned = build_ciencia_evento(chave=chave, cnpj=cnpj, homologacao=homologacao)
        with ephemeral_pfx_path(pfx) as cert_path:
            signed = AssinaturaA1(cert_path, "").assinar(unsigned)
            # uf still passed to ComunicacaoSefaz's constructor (unused for
            # this call — _get_url_an doesn't branch on self.uf, confirmed
            # reading comunicacao.py) to keep the same shape as
            # consult_distribution and in case PyNFe ever starts using it.
            comunicacao = Comunicacao(uf, cert_path, "", homologacao=homologacao)
            response = await asyncio.to_thread(comunicacao.evento, "nfe", signed, 1)
        if response.status_code >= 300:
            raise SefazResponseError(f"SEFAZ evento HTTP {response.status_code}: {response.text[:500]}")
        return parse_evento_response(response.content)


def _find_local_text(root: etree._Element, *tags: str) -> str | None:
    for tag in tags:
        for el in root.iter():
            if etree.QName(el).localname == tag and el.text:
                return el.text
    return None


def _as_xml_bytes(obj: object) -> bytes:
    if obj is None:
        return b""
    if isinstance(obj, (bytes, bytearray)):
        return bytes(obj)
    if hasattr(obj, "content"):
        content = getattr(obj, "content")
        if isinstance(content, (bytes, bytearray)):
            return bytes(content)
        text = getattr(obj, "text", None) or content
        return str(text).encode("utf-8")
    if hasattr(obj, "tag"):
        return etree.tostring(obj, encoding="utf-8")
    return str(obj).encode("utf-8")
