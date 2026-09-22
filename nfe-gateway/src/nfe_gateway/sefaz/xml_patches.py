"""XML post-processing patches ported from the production legacy messenger.

PyNFe (even GitHub main with reforma) still omits or mis-orders some SEFAZ-
required elements. Until those land upstream, apply deterministic patches
here — each function is unit-tested with structural assertions.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from lxml import etree

NFE_NS = "http://www.portalfiscal.inf.br/nfe"
NSMAP = {"nfe": NFE_NS}


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _find(root: etree._Element, local_name: str) -> etree._Element | None:
    for el in root.iter():
        if _local(el) == local_name:
            return el
    return None


def _find_all(root: etree._Element, local_name: str) -> list[etree._Element]:
    return [el for el in root.iter() if _local(el) == local_name]


def _ns_tag(name: str) -> str:
    return f"{{{NFE_NS}}}{name}"


def apply_all_patches(xml: etree._Element, sap: dict[str, Any] | None = None) -> etree._Element:
    """Apply the full post-serialize patch pipeline. Mutates and returns xml."""
    sap = sap or {}
    ensure_ean_sem_gtin(xml)
    patch_icms51(xml, sap)
    patch_id_estrangeiro(xml, sap)
    patch_ii_zero_values(xml)
    patch_fin_nfe_debito_credito(xml, sap)
    patch_ibscbs_tot(xml, sap)
    ensure_empty_payment(xml, sap)
    sanitize_for_signature(xml)
    strip_whitespace_between_tags(xml)
    remove_empty_elements(xml)
    # Namespace cleanup happens in assinar_nfe (tree rebuild, not string hacks).
    return xml


def ensure_ean_sem_gtin(xml: etree._Element) -> None:
    """Empty cEAN / cEANTrib are rejected by SEFAZ — force SEM GTIN."""
    for tag in ("cEAN", "cEANTrib"):
        for el in _find_all(xml, tag):
            if not (el.text or "").strip():
                el.text = "SEM GTIN"


def patch_icms51(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Ensure ICMS51 has vBC/pICMS/vICMSOp/pDif/vICMSDif when CST 51."""
    items = sap.get("items") or []
    icms51_nodes = _find_all(xml, "ICMS51")
    if not icms51_nodes:
        return
    for idx, node in enumerate(icms51_nodes):
        item = items[idx] if idx < len(items) else {}
        if _child(node, "modBC") is None and item.get("icms_modalidade") is not None:
            _insert_after(node, "CST", "modBC", str(item.get("icms_modalidade", "3")))
        if _child(node, "vBC") is None:
            _insert_after(node, "modBC", "vBC", _fmt2(item.get("icms_base", 0)))
        if _child(node, "pICMS") is None:
            _insert_after(node, "vBC", "pICMS", _fmt4(item.get("icms_aliquota", 0)))
        if item.get("icms_valor_operacao") is not None and _child(node, "vICMSOp") is None:
            _insert_after(node, "pICMS", "vICMSOp", _fmt2(item["icms_valor_operacao"]))
        if item.get("icms_percentual_diferimento") is not None and _child(node, "pDif") is None:
            after = "vICMSOp" if _child(node, "vICMSOp") is not None else "pICMS"
            _insert_after(node, after, "pDif", _fmt4(item["icms_percentual_diferimento"]))
        if item.get("icms_valor_diferido") is not None and _child(node, "vICMSDif") is None:
            after = "pDif" if _child(node, "pDif") is not None else "pICMS"
            _insert_after(node, after, "vICMSDif", _fmt2(item["icms_valor_diferido"]))


def patch_id_estrangeiro(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Export destinations without BR CNPJ/CPF must use idEstrangeiro before xNome."""
    dest = _find(xml, "dest")
    if dest is None:
        return
    uf = (sap.get("uf_destinatario") or "").upper()
    pais = str(sap.get("codigo_pais_destinatario") or "1058")
    is_export = uf == "EX" or (pais and pais != "1058")
    if not is_export:
        return
    cnpj = (sap.get("cnpj_destinatario") or "").strip()
    cpf = (sap.get("cpf_destinatario") or "").strip()
    if len("".join(ch for ch in cnpj if ch.isdigit())) == 14:
        return
    if len("".join(ch for ch in cpf if ch.isdigit())) == 11:
        return
    # Drop empty CNPJ/CPF tags
    for tag in ("CNPJ", "CPF"):
        child = _child(dest, tag)
        if child is not None and not (child.text or "").strip():
            dest.remove(child)
    if _child(dest, "idEstrangeiro") is None:
        id_estr = sap.get("id_estrangeiro_destinatario") or ""
        if id_estr in ("0", "00"):
            id_estr = ""
        el = etree.Element(_ns_tag("idEstrangeiro"))
        el.text = id_estr
        xnome = _child(dest, "xNome")
        if xnome is not None:
            xnome.addprevious(el)
        else:
            dest.insert(0, el)


def patch_ii_zero_values(xml: etree._Element) -> None:
    """Normalize II workaround values (0.01 → 0.00) used to force II emission."""
    for ii in _find_all(xml, "II"):
        for tag in ("vBC", "vDespAdu", "vII", "vIOF"):
            child = _child(ii, tag)
            if child is not None and child.text in ("0.01", "0,01"):
                child.text = "0.00"


def patch_fin_nfe_debito_credito(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Inject tpNFDebito/tpNFCredito and adjust tpNF for finNFe 5/6."""
    ide = _find(xml, "ide")
    if ide is None:
        return
    fin = str(sap.get("finalidade_emissao") or "")
    if fin == "5":
        tp_nf = _child(ide, "tpNF")
        if tp_nf is not None:
            tp_nf.text = "0"
        if sap.get("tp_nf_debito") and _child(ide, "tpNFDebito") is None:
            _insert_after(ide, "finNFe", "tpNFDebito", str(sap["tp_nf_debito"]))
    elif fin == "6":
        if sap.get("tp_nf_credito") and _child(ide, "tpNFCredito") is None:
            _insert_after(ide, "finNFe", "tpNFCredito", str(sap["tp_nf_credito"]))


def patch_ibscbs_tot(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Ensure IBSCBSTot exists when any item has IBSCBS (SEFAZ cStat 1119)."""
    has_item_ibscbs = bool(_find_all(xml, "IBSCBS"))
    total = _find(xml, "total")
    if total is None:
        return
    ibs_tot = _child(total, "IBSCBSTot")
    if has_item_ibscbs and ibs_tot is None:
        ibs_tot = etree.SubElement(total, _ns_tag("IBSCBSTot"))
        vbc = etree.SubElement(ibs_tot, _ns_tag("vBCIBSCBS"))
        vbc.text = _fmt2(sap.get("ibs_base_calculo") or sap.get("cbs_base_calculo") or 0)
    # Header totals if provided
    if ibs_tot is not None:
        if sap.get("ibs_uf_valor_total") is not None or sap.get("ibs_valor_total") is not None:
            g_ibs = _child(ibs_tot, "gIBS")
            if g_ibs is None:
                g_ibs = etree.SubElement(ibs_tot, _ns_tag("gIBS"))
            g_uf = _child(g_ibs, "gIBSUF")
            if g_uf is None:
                g_uf = etree.SubElement(g_ibs, _ns_tag("gIBSUF"))
                for tag, val in (
                    ("vDif", "0.00"),
                    ("vDevTrib", "0.00"),
                    ("vIBSUF", _fmt2(sap.get("ibs_uf_valor_total") or sap.get("ibs_valor_total") or 0)),
                ):
                    if _child(g_uf, tag) is None:
                        etree.SubElement(g_uf, _ns_tag(tag)).text = val


def ensure_empty_payment(xml: etree._Element, sap: dict[str, Any]) -> None:
    """finNFe 3/4 (and empty pag) need detPag with tPag=90."""
    fin = str(sap.get("finalidade_emissao") or "1")
    pag = _find(xml, "pag")
    if pag is None:
        inf = _find(xml, "infNFe")
        if inf is None:
            return
        total = _child(inf, "total")
        pag = _append_nfe_child(inf if total is None else None, "pag", after=total)
        if pag is None:
            return
    det = _child(pag, "detPag")
    if det is None and (fin in ("3", "4") or not (sap.get("formas_pagamento") or [])):
        det = _sub_nfe(pag, "detPag")
        _sub_nfe(det, "tPag", "90")
        _sub_nfe(det, "vPag", "0.00")


def _nfe_qname(parent: etree._Element, local: str) -> str:
    """Build Clark name in the same namespace as parent (avoids ns0: on new tags)."""
    ns = etree.QName(parent).namespace or NFE_NS
    return f"{{{ns}}}{local}"


def _sub_nfe(parent: etree._Element, local: str, text: str | None = None) -> etree._Element:
    el = etree.SubElement(parent, _nfe_qname(parent, local))
    if text is not None:
        el.text = text
    return el


def _append_nfe_child(
    parent: etree._Element | None,
    local: str,
    *,
    after: etree._Element | None = None,
) -> etree._Element | None:
    if after is not None:
        parent = after.getparent()
        if parent is None:
            return None
        el = etree.Element(_nfe_qname(parent, local))
        after.addnext(el)
        return el
    if parent is None:
        return None
    return _sub_nfe(parent, local)


def strip_whitespace_between_tags(xml: etree._Element) -> None:
    for el in xml.iter():
        if el.text is not None and not el.text.strip() and len(el):
            el.text = None
        if el.tail is not None and not el.tail.strip():
            el.tail = None


# Characters that commonly trigger SEFAZ cStat 297 when left in free-text fields.
_FORBIDDEN_CHARS = str.maketrans(
    {
        "\u00aa": "",  # ª
        "\u00ba": "",  # º
        "\u00b2": "2",
        "\u00b3": "3",
        "\u00b9": "1",
        "\u00a7": "",  # §
        "\u00b4": "",  # ´
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\xa0": " ",
        "\t": " ",
        "\r": " ",
        "\n": " ",
    }
)


def sanitize_for_signature(xml: etree._Element) -> None:
    """Normalize text nodes before signing (cStat 297 prevention).

    SEFAZ recalculates the digest over the received ``infNFe``. Leading/trailing
    spaces, newlines and some special characters are a frequent cause of
    ``Assinatura difere do calculado``. PyNFe also runs ``remover_acentos`` at
    sign time; we mirror that early so patches and digests see the same text.
    """
    from unicodedata import normalize

    for el in xml.iter():
        if el.text:
            text = el.text.translate(_FORBIDDEN_CHARS).strip()
            text = normalize("NFKD", text).encode("ASCII", "ignore").decode("ASCII")
            text = " ".join(text.split())
            el.text = text or None
        if el.tail:
            tail = el.tail.translate(_FORBIDDEN_CHARS).strip()
            tail = normalize("NFKD", tail).encode("ASCII", "ignore").decode("ASCII")
            el.tail = tail or None


# Optional empty elements that schema allows with empty content.
_KEEP_EMPTY = frozenset({"idEstrangeiro"})


def remove_empty_elements(xml: etree._Element) -> None:
    """Drop empty leaf tags so SEFAZ does not strip them after our digest."""

    def _walk(parent: etree._Element) -> None:
        for child in list(parent):
            _walk(child)
            local = _local(child)
            if len(child) == 0 and not (child.text or "").strip() and local not in _KEEP_EMPTY:
                parent.remove(child)

    _walk(xml)


def _child(parent: etree._Element, local_name: str) -> etree._Element | None:
    for child in parent:
        if _local(child) == local_name:
            return child
    return None


def _insert_after(parent: etree._Element, after_local: str, new_local: str, text: str) -> None:
    el = etree.Element(_ns_tag(new_local))
    el.text = text
    after = _child(parent, after_local)
    if after is not None:
        after.addnext(el)
    else:
        parent.append(el)


def _fmt2(val: Any) -> str:
    return f"{Decimal(str(val or 0)):.2f}"


def _fmt4(val: Any) -> str:
    return f"{Decimal(str(val or 0)):.4f}"
