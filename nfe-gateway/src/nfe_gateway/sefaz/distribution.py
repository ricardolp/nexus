"""Maps SEFAZ's raw cStat codes for the NSU distribution query onto the
PollOutcome the rest of the service reasons about. Kept separate from the
PyNFe call site so the mapping itself is unit-testable and the "what does
138/137/656 mean" knowledge lives in one place.

Reference: https://github.com/TadaSoftware/PyNFe/wiki/Fluxo-da-Consulta-de-Distribuicao-por-NSU
"""

from __future__ import annotations

import base64
import gzip
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from lxml import etree

from nfe_gateway.distribution_state import PollOutcome

CSTAT_HAS_MORE = "138"
CSTAT_NO_CONTENT = "137"
CSTAT_RATE_LIMITED = "656"


@dataclass
class DistributionDocument:
    nsu: int
    schema: str  # 'resNFe' | 'procNFe' | 'resEvento' | ...
    xml_bytes: bytes


@dataclass
class DistributionResult:
    cstat: str
    xmotivo: str
    ult_nsu: int
    max_nsu: int
    documents: list[DistributionDocument] = field(default_factory=list)


def classify_cstat(cstat: str) -> PollOutcome:
    if cstat == CSTAT_HAS_MORE:
        return PollOutcome.HAS_MORE
    if cstat == CSTAT_NO_CONTENT:
        return PollOutcome.NO_CONTENT
    if cstat == CSTAT_RATE_LIMITED:
        return PollOutcome.RATE_LIMITED
    return PollOutcome.ERROR


class SefazResponseError(RuntimeError):
    """Raised when SEFAZ's SOAP response can't be interpreted at all (a
    soap:Fault, an HTTP error body, or a shape that doesn't match
    retDistDFeInt) — distinct from a well-formed but unwelcome cStat (656,
    which classify_cstat maps to PollOutcome.RATE_LIMITED, not an
    exception)."""


def _by_localname(element: etree._Element, name: str) -> etree._Element | None:
    """SOAP toolkits across the 27 UFs + the AN endpoint don't agree on a
    single namespace/prefix for the envelope or the nfe payload — matching
    on local name only (ignoring namespace) is the same approach PyNFe's own
    `_construir_xml_soap` uses when building requests, applied here in
    reverse for parsing responses."""
    for candidate in element.iter():
        if etree.QName(candidate).localname == name:
            return candidate
    return None


def _child_text(element: etree._Element, name: str) -> str | None:
    child = _by_localname(element, name)
    return child.text if child is not None else None


@dataclass
class PendingDocumentSummary:
    chave: str | None
    cnpj_emitente: str | None
    nome_emitente: str | None
    valor: Decimal | None
    data_emissao: datetime | None
    protocolo: str | None
    situacao: str | None


def parse_pending_summary(xml_bytes: bytes) -> PendingDocumentSummary | None:
    """Best-effort field extraction for a resNFe/resEvento/procEventoNFe
    payload — the ones distribution_poller.py/query_worker.py skip instead
    of ingesting (no <infNFe>, so the backend's normal pipeline can't take
    them). Used to populate nfe_pending_manifestation_documents so a human
    has something to act on (send Ciência) instead of the chave being lost
    once the NSU cursor moves past it. Matches by local name only, same
    rationale as _by_localname — fields simply come back None for shapes
    that don't carry them (e.g. procEventoNFe has no vNF/nProt)."""
    try:
        root = etree.fromstring(xml_bytes)
    except etree.XMLSyntaxError:
        return None

    chave = _child_text(root, "chNFe")
    if not chave:
        return None  # nothing worth a row without an identity to key on

    cnpj = _child_text(root, "CNPJ") or _child_text(root, "CPF")
    nome = _child_text(root, "xNome")
    vnf_raw = _child_text(root, "vNF")
    valor = None
    if vnf_raw:
        try:
            valor = Decimal(vnf_raw)
        except (ValueError, ArithmeticError):
            valor = None
    dhemi_raw = _child_text(root, "dhEmi") or _child_text(root, "dhEvento")
    data_emissao = None
    if dhemi_raw:
        try:
            data_emissao = datetime.fromisoformat(dhemi_raw)
        except ValueError:
            data_emissao = None
    protocolo = _child_text(root, "nProt")
    situacao = _child_text(root, "cSitNFe") or _child_text(root, "tpEvento")

    return PendingDocumentSummary(
        chave=chave,
        cnpj_emitente=cnpj,
        nome_emitente=nome,
        valor=valor,
        data_emissao=data_emissao,
        protocolo=protocolo,
        situacao=situacao,
    )


def parse_distribution_response(soap_xml: bytes) -> DistributionResult:
    """Parses the raw SOAP response body from
    ComunicacaoSefaz.consulta_distribuicao (NFeDistribuicaoDFe) into a
    DistributionResult. Structure (SEFAZ NT 2014.002, confirmed against
    nfephp-org/sped-nfe's documented response shape — PyNFe itself has no
    parser for this one response type, only for docZip's own gzip+base64
    encoding via utils.descompactar.DescompactaGzip):

        soap:Envelope/soap:Body/nfeDistDFeInteresseResponse/
            nfeDistDFeInteresseResult/retDistDFeInt
                cStat, xMotivo, ultNSU, maxNSU
                loteDistDFeInt/docZip[NSU=.., schema=..] (0+, gzip+base64)

    Each docZip's decompressed payload is one of resNFe/procNFe/resEvento/
    procEventoNFe — the backend's existing inbound pipeline (POST
    /v1/inbound/fiscal_documents/nfe) is the one place that needs to
    understand those schemas differently; this parser only extracts the
    envelope-level bookkeeping (cStat/NSU) and hands the raw decompressed
    XML bytes through byte-for-byte. Deliberately does NOT reuse PyNFe's own
    utils.descompactar.DescompactaGzip, which parses into an lxml Element —
    fine for inspection, but re-serializing it back to bytes for the
    backend risks perturbing whitespace/attribute order inside procNFe's
    digitally-signed body. base64+gzip is decoded directly here instead, so
    the bytes handed to the backend are exactly what SEFAZ sent.
    """
    try:
        root = etree.fromstring(soap_xml)
    except etree.XMLSyntaxError as exc:
        raise SefazResponseError(f"SEFAZ response was not well-formed XML: {exc}") from exc

    ret = _by_localname(root, "retDistDFeInt")
    if ret is None:
        fault = _by_localname(root, "Fault")
        if fault is not None:
            reason = _child_text(fault, "Text") or _child_text(fault, "faultstring") or "unknown SOAP fault"
            raise SefazResponseError(f"SEFAZ returned a SOAP fault: {reason}")
        raise SefazResponseError("SEFAZ response did not contain retDistDFeInt or a SOAP fault")

    cstat = _child_text(ret, "cStat")
    if cstat is None:
        raise SefazResponseError("retDistDFeInt is missing cStat")
    xmotivo = _child_text(ret, "xMotivo") or ""
    ult_nsu = int(_child_text(ret, "ultNSU") or "0")
    max_nsu = int(_child_text(ret, "maxNSU") or "0")

    documents: list[DistributionDocument] = []
    lote = _by_localname(ret, "loteDistDFeInt")
    if lote is not None:
        for doc_zip in lote:
            if etree.QName(doc_zip).localname != "docZip" or not doc_zip.text:
                continue
            documents.append(
                DistributionDocument(
                    nsu=int(doc_zip.get("NSU")),
                    schema=doc_zip.get("schema", ""),
                    xml_bytes=gzip.decompress(base64.b64decode(doc_zip.text)),
                )
            )
    documents.sort(key=lambda d: d.nsu)

    return DistributionResult(cstat=cstat, xmotivo=xmotivo, ult_nsu=ult_nsu, max_nsu=max_nsu, documents=documents)
