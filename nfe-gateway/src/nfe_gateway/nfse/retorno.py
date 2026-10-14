"""Leitura do IBS/CBS calculado pela SEFIN Nacional na NFS-e autorizada.

Na NFS-e Nacional a DPS só leva a classificação (CST, cClassTrib). cIndOp,
quando a SEFIN o aceitar, também fica nesse grupo.
Base, alíquotas e valores de IBS/CBS são calculados pela SEFIN e devolvidos
em ``infNFSe/IBSCBS`` (``valores`` + ``totCIBS``). Este módulo extrai esse
grupo para que o backend persista e devolva ao cliente (webhook / SAP).
"""

from __future__ import annotations

from typing import Any

from lxml import etree


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _child(parent: etree._Element | None, name: str) -> etree._Element | None:
    if parent is None:
        return None
    for child in parent:
        if isinstance(child.tag, str) and _local(child) == name:
            return child
    return None


def _path(parent: etree._Element | None, *names: str) -> etree._Element | None:
    node = parent
    for name in names:
        node = _child(node, name)
        if node is None:
            return None
    return node


def _text(parent: etree._Element | None, *names: str) -> str:
    node = _path(parent, *names)
    if node is None or node.text is None:
        return ""
    return node.text.strip()


def _find_first(root: etree._Element, name: str) -> etree._Element | None:
    for el in root.iter():
        if isinstance(el.tag, str) and _local(el) == name:
            return el
    return None


def extract_nfse_number(nfse_xml: bytes | str | etree._Element | None) -> str:
    """Número da NFS-e gerado pela SEFIN (``infNFSe/nNFSe``), sem zeros à esquerda.

    A DPS leva ``nDPS`` (o RPS do SAP). O número da nota só existe no XML
    autorizado. A resposta JSON da SEFIN não traz esse campo no topo.
    """
    root = _xml_root(nfse_xml)
    if root is None:
        return ""
    inf = root if _local(root) == "infNFSe" else _find_first(root, "infNFSe")
    if inf is None:
        return ""
    raw = _text(inf, "nNFSe")
    if raw.isdigit():
        return raw.lstrip("0") or "0"
    return raw


def _xml_root(nfse_xml: bytes | str | etree._Element | None) -> etree._Element | None:
    if nfse_xml is None:
        return None
    if isinstance(nfse_xml, etree._Element):
        return nfse_xml
    raw = nfse_xml.encode("utf-8") if isinstance(nfse_xml, str) else nfse_xml
    if not raw or not raw.strip():
        return None
    try:
        return etree.fromstring(raw)
    except etree.XMLSyntaxError:
        return None


def extract_ibscbs(nfse_xml: bytes | str | etree._Element | None) -> dict[str, Any] | None:
    """Return the SEFIN-calculated IBS/CBS of an authorized NFS-e, or None.

    Keys mirror the Go ``fiscal.NFSeIBSCBSResult`` JSON tags. Values are the
    decimal strings exactly as printed by the SEFIN (rates in percent).
    """
    if nfse_xml is None:
        return None
    if isinstance(nfse_xml, etree._Element):
        root = nfse_xml
    else:
        raw = nfse_xml.encode("utf-8") if isinstance(nfse_xml, str) else nfse_xml
        if not raw or not raw.strip():
            return None
        try:
            root = etree.fromstring(raw)
        except etree.XMLSyntaxError:
            return None

    inf = root if _local(root) == "infNFSe" else _find_first(root, "infNFSe")
    if inf is None:
        return None
    ibs = _child(inf, "IBSCBS")  # SEFIN group (not the DPS one, which is nested under DPS/infDPS)
    if ibs is None:
        return None

    valores = _child(ibs, "valores")
    tot = _child(ibs, "totCIBS")
    dps_ibs = _path(inf, "DPS", "infDPS", "IBSCBS")
    # NT 009 v1.01: CST/cClassTrib diretos em trib. O layout anterior os
    # aninhava em gIBSCBS — ainda lido para NFS-e já autorizadas.
    trib = _path(dps_ibs, "valores", "trib")
    clas = trib if _text(trib, "CST") else _child(trib, "gIBSCBS")

    out: dict[str, Any] = {
        "cst": _text(clas, "CST"),
        "c_class_trib": _text(clas, "cClassTrib"),
        "c_ind_op": _text(dps_ibs, "cIndOp") or _text(ibs, "cIndOp"),
        "c_localidade_incid": _text(ibs, "cLocalidadeIncid"),
        "x_localidade_incid": _text(ibs, "xLocalidadeIncid"),
        "v_bc": _text(valores, "vBC"),
        "p_ibs_uf": _text(valores, "uf", "pIBSUF"),
        "p_red_aliq_uf": _text(valores, "uf", "pRedAliqUF"),
        "p_aliq_efet_uf": _text(valores, "uf", "pAliqEfetUF"),
        "p_ibs_mun": _text(valores, "mun", "pIBSMun"),
        "p_red_aliq_mun": _text(valores, "mun", "pRedAliqMun"),
        "p_aliq_efet_mun": _text(valores, "mun", "pAliqEfetMun"),
        "p_cbs": _text(valores, "fed", "pCBS"),
        "p_red_aliq_cbs": _text(valores, "fed", "pRedAliqCBS"),
        "p_aliq_efet_cbs": _text(valores, "fed", "pAliqEfetCBS"),
        "v_ibs_uf": _text(tot, "gIBS", "gIBSUFTot", "vIBSUF"),
        "v_ibs_mun": _text(tot, "gIBS", "gIBSMunTot", "vIBSMun"),
        "v_ibs": _text(tot, "gIBS", "vIBSTot"),
        "v_cbs": _text(tot, "gCBS", "vCBS"),
        "v_tot_nf": _text(tot, "vTotNF"),
    }
    cleaned = {k: v for k, v in out.items() if v}
    value_keys = ("v_bc", "v_ibs_uf", "v_ibs_mun", "v_ibs", "v_cbs", "v_tot_nf")
    if not any(k in cleaned for k in value_keys):
        return None
    return cleaned
