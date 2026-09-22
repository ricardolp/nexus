"""Parse SEFAZ retEnviNFe / retConsReciNFe payloads.

Lote-level cStat 104 means \"lote processado\" — the NF-e outcome lives in
``protNFe/infProt`` (cStat 100/150 authorized, or a denegação/rejeição).
Taking the first ``cStat`` in the SOAP body incorrectly treats 104 as the
document result.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lxml import etree

AUTHORIZED_CSTATS = frozenset({"100", "150"})
LOTE_RECEIVED = "103"  # needs recibo poll
LOTE_PROCESSED = "104"
LOTE_IN_PROCESSING = "105"
# Already authorized under the same access key — recover via consulta por chave.
DUPLICIDADE_CSTAT = "204"


@dataclass(frozen=True)
class SefazNFeResult:
    outcome: str  # authorized | rejected | poll_recibo | processing
    cstat: str | None
    x_motivo: str
    protocol: str | None = None
    access_key: str | None = None
    recibo: str | None = None
    lote_cstat: str | None = None
    prot_nfe: etree._Element | None = None


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _find_first(root: etree._Element, name: str) -> etree._Element | None:
    for el in root.iter():
        if _local(el) == name:
            return el
    return None


def _direct_child_text(parent: etree._Element, name: str) -> str | None:
    for child in parent:
        if _local(child) == name and child.text:
            return child.text.strip()
    return None


def _text_in(el: etree._Element | None, name: str) -> str | None:
    if el is None:
        return None
    found = _find_first(el, name)
    if found is not None and found.text:
        return found.text.strip()
    return None


def parse_autorizacao_or_recibo_xml(root: etree._Element) -> SefazNFeResult:
    """Interpret sync autorizacao or consulta_recibo XML."""
    ret_envi = _find_first(root, "retEnviNFe")
    ret_reci = _find_first(root, "retConsReciNFe")
    lote_el = ret_envi if ret_envi is not None else ret_reci

    lote_cstat = _direct_child_text(lote_el, "cStat") if lote_el is not None else None
    if lote_cstat is None:
        # Fallback: first cStat in document (legacy / odd envelopes)
        lote_cstat = _text_in(root, "cStat")

    lote_motivo = ""
    if lote_el is not None:
        lote_motivo = _direct_child_text(lote_el, "xMotivo") or ""
    if not lote_motivo:
        lote_motivo = _text_in(root, "xMotivo") or ""

    if lote_cstat == LOTE_RECEIVED:
        return SefazNFeResult(
            outcome="poll_recibo",
            cstat=lote_cstat,
            x_motivo=lote_motivo or "Lote recebido com sucesso",
            recibo=_text_in(root, "nRec"),
            lote_cstat=lote_cstat,
        )

    if lote_cstat == LOTE_IN_PROCESSING:
        return SefazNFeResult(
            outcome="processing",
            cstat=lote_cstat,
            x_motivo=lote_motivo or "Lote em processamento",
            lote_cstat=lote_cstat,
        )

    inf_prot = _find_first(root, "infProt")
    prot_nfe = _find_first(root, "protNFe")

    if inf_prot is not None:
        cstat = _direct_child_text(inf_prot, "cStat") or _text_in(inf_prot, "cStat")
        x_motivo = _direct_child_text(inf_prot, "xMotivo") or _text_in(inf_prot, "xMotivo") or ""
        protocol = _direct_child_text(inf_prot, "nProt") or _text_in(inf_prot, "nProt")
        access_key = _direct_child_text(inf_prot, "chNFe") or _text_in(inf_prot, "chNFe")
        if cstat in AUTHORIZED_CSTATS:
            return SefazNFeResult(
                outcome="authorized",
                cstat=cstat,
                x_motivo=x_motivo or "Autorizado o uso da NF-e",
                protocol=protocol,
                access_key=access_key,
                lote_cstat=lote_cstat,
                prot_nfe=prot_nfe,
            )
        return SefazNFeResult(
            outcome="rejected",
            cstat=cstat,
            x_motivo=x_motivo,
            protocol=protocol,
            access_key=access_key,
            lote_cstat=lote_cstat,
            prot_nfe=prot_nfe,
        )

    # Lote 104 without protNFe — incomplete; caller may retry via recibo if nRec exists
    if lote_cstat == LOTE_PROCESSED:
        nrec = _text_in(root, "nRec")
        if nrec:
            return SefazNFeResult(
                outcome="poll_recibo",
                cstat=lote_cstat,
                x_motivo=lote_motivo or "Lote processado",
                recibo=nrec,
                lote_cstat=lote_cstat,
            )
        return SefazNFeResult(
            outcome="rejected",
            cstat=lote_cstat,
            x_motivo=(lote_motivo or "Lote processado") + " (sem protNFe/infProt na resposta)",
            lote_cstat=lote_cstat,
        )

    # Authorized nfeProc without going through lote wrapper
    if _find_first(root, "nfeProc") is not None and _find_first(root, "infProt") is None:
        # nfeProc always has infProt — already handled above if present
        pass

    cstat = lote_cstat or _text_in(root, "cStat")
    if cstat in AUTHORIZED_CSTATS:
        return SefazNFeResult(
            outcome="authorized",
            cstat=cstat,
            x_motivo=lote_motivo or "Autorizado o uso da NF-e",
            protocol=_text_in(root, "nProt"),
            access_key=_text_in(root, "chNFe"),
            lote_cstat=lote_cstat,
        )

    return SefazNFeResult(
        outcome="rejected",
        cstat=cstat,
        x_motivo=lote_motivo,
        lote_cstat=lote_cstat,
    )


def extract_access_key_from_nfe(nota: etree._Element | None) -> str | None:
    """Pull the 44-digit chave from signed ``infNFe/@Id`` (``NFe{chave}``)."""
    if nota is None:
        return None
    for el in nota.iter():
        if _local(el) != "infNFe":
            continue
        id_attr = (el.get("Id") or "").strip()
        digits = "".join(ch for ch in id_attr if ch.isdigit())
        if len(digits) == 44:
            return digits
    ch = _text_in(nota, "chNFe")
    if ch and len("".join(c for c in ch if c.isdigit())) == 44:
        return "".join(c for c in ch if c.isdigit())
    return None


def parse_consulta_situacao_xml(root: etree._Element) -> SefazNFeResult:
    """Interpret ``retConsSitNFe`` from NFeConsultaProtocolo (consulta por chave)."""
    ret = _find_first(root, "retConsSitNFe")
    sit_el = ret if ret is not None else root

    sit_cstat = _direct_child_text(sit_el, "cStat") or _text_in(sit_el, "cStat")
    sit_motivo = _direct_child_text(sit_el, "xMotivo") or _text_in(sit_el, "xMotivo") or ""
    access_key = _direct_child_text(sit_el, "chNFe") or _text_in(sit_el, "chNFe")

    inf_prot = _find_first(root, "infProt")
    prot_nfe = _find_first(root, "protNFe")

    if inf_prot is not None:
        cstat = _direct_child_text(inf_prot, "cStat") or _text_in(inf_prot, "cStat")
        x_motivo = (
            _direct_child_text(inf_prot, "xMotivo")
            or _text_in(inf_prot, "xMotivo")
            or sit_motivo
        )
        protocol = _direct_child_text(inf_prot, "nProt") or _text_in(inf_prot, "nProt")
        prot_key = _direct_child_text(inf_prot, "chNFe") or _text_in(inf_prot, "chNFe")
        key = prot_key or access_key
        if cstat in AUTHORIZED_CSTATS:
            return SefazNFeResult(
                outcome="authorized",
                cstat=cstat,
                x_motivo=x_motivo or "Autorizado o uso da NF-e",
                protocol=protocol,
                access_key=key,
                prot_nfe=prot_nfe,
            )
        return SefazNFeResult(
            outcome="rejected",
            cstat=cstat,
            x_motivo=x_motivo,
            protocol=protocol,
            access_key=key,
            prot_nfe=prot_nfe,
        )

    if sit_cstat in AUTHORIZED_CSTATS:
        return SefazNFeResult(
            outcome="authorized",
            cstat=sit_cstat,
            x_motivo=sit_motivo or "Autorizado o uso da NF-e",
            protocol=_text_in(sit_el, "nProt"),
            access_key=access_key,
            prot_nfe=prot_nfe,
        )

    return SefazNFeResult(
        outcome="rejected",
        cstat=sit_cstat,
        x_motivo=sit_motivo,
        access_key=access_key,
        prot_nfe=prot_nfe,
    )


def build_nfe_proc(nota_fiscal: Any, prot_nfe: etree._Element | None) -> bytes | None:
    """Assemble ``nfeProc`` when PyNFe returned (1, response, nota) but NF was authorized."""
    if nota_fiscal is None or prot_nfe is None:
        return None
    try:
        ns = "http://www.portalfiscal.inf.br/nfe"
        raiz = etree.Element("{%s}nfeProc" % ns, nsmap={None: ns}, versao="4.00")
        # append copies so we don't detach from original trees
        raiz.append(etree.fromstring(etree.tostring(nota_fiscal)))
        raiz.append(etree.fromstring(etree.tostring(prot_nfe)))
        return etree.tostring(raiz, encoding="utf-8", xml_declaration=True)
    except Exception:
        return None
