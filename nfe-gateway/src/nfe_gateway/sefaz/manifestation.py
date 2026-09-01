"""Manifestação do Destinatário (NT 2020.001) — building/signing the evento
XML and parsing SEFAZ's RecepcaoEvento response. Kept separate from
distribution.py the same way that module is separate from client.py: the
"what does this response mean" knowledge is unit-testable without a real
SEFAZ call or a real certificate.

Deliberately only wires "Ciência da Operação" (tp_evento 210210, operacao=2
in PyNFe's EventoManifestacaoDest) — not Confirmação/Desconhecimento/Operação
não Realizada. Ciência is the "let me see the full document" unlock step and
carries no assertion about the note's content; the other three are a real
business decision that has to be made by a human (or SAP) after actually
reading the procNFe this unlocks, not something this service should ever
submit on its own initiative. See docs/architecture/22_nfe_gateway_service.md.

Reference: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=x/N7MoSHLxE%3D
(Nota Técnica 2020.001 - Evento de Manifestação do Destinatário)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from lxml import etree
from pynfe.entidades.evento import EventoManifestacaoDest
from pynfe.processamento.serializacao import SerializacaoXML

CIENCIA_DA_OPERACAO = 2  # EventoManifestacaoDest.operacao code — do not change
# without re-reading the "only Ciência" rationale above.

CSTAT_LOTE_PROCESSADO = "128"
CSTAT_EVENTO_VINCULADO = "135"
CSTAT_EVENTO_DUPLICADO = "573"


def build_ciencia_evento(*, chave: str, cnpj: str, homologacao: bool, sequence: int = 1) -> etree._Element:
    """Builds the unsigned <evento> element for a Ciência da Operação event.

    cOrgao is always "91" (Ambiente Nacional/SVAN) — confirmed by web search
    against multiple real-world RecepcaoEvento integration reports (ACBrNFe
    forum threads, moc.sped.fazenda.pr.gov.br), NOT the company's own UF.
    This is real and was caught live: passing the company's registration UF
    (e.g. "SC" for LS Mtron) here produced a genuine SEFAZ rejection —
    cStat 657 "Codigo do Orgao diverge do orgao autorizador" — confirmed
    2026-08-17 against homologação. Manifestação events always target the
    national environment regardless of which UF authorized the underlying
    NF-e or where the recipient is registered, which is also why
    ComunicacaoSefaz.evento() picks _get_url_an unconditionally for any
    tpEvento starting with "2" (see client.py's submit_ciencia docstring) —
    that URL selection and this cOrgao value need to agree, and now do.
    PyNFe's own CODIGOS_ESTADOS map already has this mapping built in
    ("AN" -> "91"), so passing uf="AN" through the normal serializer path
    is correct, not a special case needing a raw string override.

    homologacao mirrors sefaz.environment.resolve_homologacao's output — the
    caller must resolve that first, same as consult_distribution does, so a
    misconfigured/prematurely-flipped company record can't reach produção on
    its own. fonte_dados=None on SerializacaoXML is safe: serializar_evento
    never touches self._fonte_dados (only .exportar()/.importar() do,
    confirmed by reading processamento/serializacao.py — neither is called
    here)."""
    evento = EventoManifestacaoDest(operacao=CIENCIA_DA_OPERACAO)
    evento.cnpj = cnpj
    evento.chave = chave
    evento.uf = "AN"
    # PyNFe's SerializacaoXML.serializar_evento builds dhEvento by taking
    # data_emissao's raw digits via strftime (no tz-aware conversion) and
    # separately appending datetime.now().astimezone()'s LOCAL offset — the
    # two must already agree, or the declared instant silently shifts. UTC
    # here produced digits ~3h ahead of "now" labeled as -03:00, which
    # SEFAZ correctly rejected as a future date (cStat 578, confirmed live
    # 2026-08-17). Naive local time is what this needs to be, matching
    # exactly what the offset calculation already uses.
    evento.data_emissao = datetime.now()
    evento.n_seq_evento = sequence
    serializer = SerializacaoXML(None, homologacao=homologacao)
    return serializer.serializar_evento(evento)


@dataclass
class EventoResult:
    lote_cstat: str
    lote_xmotivo: str
    evento_cstat: str | None
    evento_xmotivo: str | None
    protocolo: str | None

    @property
    def accepted(self) -> bool:
        # 573 (duplicidade) is treated as accepted too — SEFAZ is telling us
        # this exact chave+tpEvento+CNPJ was already manifested, which is
        # the outcome we wanted anyway (idempotent from our side).
        return self.evento_cstat in (CSTAT_EVENTO_VINCULADO, CSTAT_EVENTO_DUPLICADO)


class ManifestationResponseError(RuntimeError):
    """Response wasn't well-formed XML, or didn't contain retEnvEvento/a
    SOAP fault at all — distinct from a well-formed but rejected cStat,
    which parse_evento_response returns as a non-accepted EventoResult."""


def _by_localname(element: etree._Element, name: str) -> etree._Element | None:
    for candidate in element.iter():
        if etree.QName(candidate).localname == name:
            return candidate
    return None


def _child_text(element: etree._Element, name: str) -> str | None:
    child = _by_localname(element, name)
    return child.text if child is not None else None


def parse_evento_response(soap_xml: bytes) -> EventoResult:
    """retEnvEvento carries a lote-level cStat (128 = lote processado is the
    only "the batch itself worked" answer — anything else means SEFAZ never
    even looked at the individual event) and, when the lote was processed,
    one retEvento per submitted event with its own cStat (135 = vinculado ao
    documento = success; 573 = duplicidade = already manifested, also
    treated as success — see EventoResult.accepted)."""
    try:
        root = etree.fromstring(soap_xml)
    except etree.XMLSyntaxError as exc:
        raise ManifestationResponseError(f"SEFAZ response was not well-formed XML: {exc}") from exc

    ret = _by_localname(root, "retEnvEvento")
    if ret is None:
        fault = _by_localname(root, "Fault")
        if fault is not None:
            reason = _child_text(fault, "Text") or _child_text(fault, "faultstring") or "unknown SOAP fault"
            raise ManifestationResponseError(f"SEFAZ returned a SOAP fault: {reason}")
        raise ManifestationResponseError("SEFAZ response did not contain retEnvEvento or a SOAP fault")

    lote_cstat = _child_text(ret, "cStat")
    if lote_cstat is None:
        raise ManifestationResponseError("retEnvEvento is missing cStat")
    lote_xmotivo = _child_text(ret, "xMotivo") or ""

    ret_evento = _by_localname(ret, "retEvento")
    evento_cstat = _child_text(ret_evento, "cStat") if ret_evento is not None else None
    evento_xmotivo = _child_text(ret_evento, "xMotivo") if ret_evento is not None else None
    protocolo = _child_text(ret_evento, "nProt") if ret_evento is not None else None

    return EventoResult(
        lote_cstat=lote_cstat,
        lote_xmotivo=lote_xmotivo,
        evento_cstat=evento_cstat,
        evento_xmotivo=evento_xmotivo,
        protocolo=protocolo,
    )
