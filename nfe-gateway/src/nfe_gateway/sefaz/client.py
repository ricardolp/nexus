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

from pynfe.processamento.assinatura import AssinaturaA1
from pynfe.processamento.comunicacao import ComunicacaoSefaz

from nfe_gateway.sefaz.distribution import (
    DistributionResult,
    SefazResponseError,
    parse_distribution_response,
)
from nfe_gateway.sefaz.environment import HOMOLOGACAO_DISCLAIMER, resolve_homologacao
from nfe_gateway.sefaz.manifestation import EventoResult, build_ciencia_evento, parse_evento_response


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
        self, *, uf: str, environment: str, pfx: bytes, xml_bytes: bytes
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
            comunicacao = ComunicacaoSefaz(uf, cert_path, "", homologacao=homologacao)
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
        self, *, uf: str, environment: str, pfx: bytes, xml_bytes: bytes
    ) -> dict:
        homologacao = resolve_homologacao(environment, self.force_homologacao)
        with ephemeral_pfx_path(pfx) as cert_path:
            _ = cert_path, homologacao, HOMOLOGACAO_DISCLAIMER  # see class docstring: inject the disclaimer into infCpl when homologacao is True
            raise NotImplementedError(
                "wire up pynfe NFe authorization (autorizar/consultar recibo) here"
            )

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
            comunicacao = ComunicacaoSefaz(uf, cert_path, "", homologacao=homologacao)
            response = await asyncio.to_thread(comunicacao.evento, "55", signed, 1)
        if response.status_code >= 300:
            raise SefazResponseError(f"SEFAZ evento HTTP {response.status_code}: {response.text[:500]}")
        return parse_evento_response(response.content)
