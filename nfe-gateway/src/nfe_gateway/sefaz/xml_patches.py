"""XML post-processing patches ported from the production legacy messenger.

PyNFe (even GitHub main with reforma) still omits or mis-orders some SEFAZ-
required elements. Until those land upstream, apply deterministic patches
here — each function is unit-tested with structural assertions.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from lxml import etree

from nfe_gateway.sefaz.ibscbs_nfe import apply_ibscbs_nfe, rebuild_ibscbs_tot
from nfe_gateway.sefaz.referencias_nfe import patch_dfe_referenciado, patch_ide_referencias

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


# SEFAZ-BA (cStat 486): autXML with accounting-office CNPJ/CPF is mandatory.
# When the issuer has no accountant, BA requires its own CNPJ as placeholder.
SEFAZ_BA_AUTXML_CNPJ = "13937073000156"


def apply_all_patches(xml: etree._Element, sap: dict[str, Any] | None = None) -> etree._Element:
    """Apply the full post-serialize patch pipeline. Mutates and returns xml."""
    sap = sap or {}
    ensure_ean_sem_gtin(xml)
    patch_icms51(xml, sap)
    patch_id_estrangeiro(xml, sap)
    patch_exterior_destinatario(xml, sap)
    patch_cnpj_documents(xml, sap)
    patch_ii_zero_values(xml)
    patch_fin_nfe_debito_credito(xml, sap)
    # Reforma: NFref / gCompraGov / gPagAntecipado before IBSCBS (gTribCompraGov
    # depends on ide/gCompraGov), then item IBSCBS + IBSCBSTot, then
    # det/DFeReferenciado (devolução por item, VC02-14).
    patch_ide_referencias(xml, sap)
    apply_ibscbs_nfe(xml, sap)
    patch_dfe_referenciado(xml, sap)
    patch_aut_xml_bahia(xml, sap)
    ensure_empty_payment(xml, sap)
    ensure_payment_troco(xml, sap)
    patch_icms_uf_dest(xml, sap)
    patch_ver_proc(xml)
    sanitize_for_signature(xml)
    strip_whitespace_between_tags(xml)
    remove_empty_elements(xml)
    # Namespace cleanup happens in assinar_nfe (tree rebuild, not string hacks).
    return xml


def patch_ver_proc(xml: etree._Element) -> None:
    """Replace PyNFe's default verProc with the Nexus product identifier."""
    ide = _find(xml, "ide")
    if ide is None:
        return
    ver = _child(ide, "verProc")
    if ver is not None:
        ver.text = "nexus"
    else:
        etree.SubElement(ide, _ns_tag("verProc")).text = "nexus"


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


def _digits(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _is_foreign_dest(sap: dict[str, Any]) -> bool:
    """Exterior recipient without a Brazilian CNPJ/CPF (idEstrangeiro)."""
    uf = str(sap.get("uf_destinatario") or "").strip().upper()
    pais = str(sap.get("codigo_pais_destinatario") or "").strip()
    local = str(sap.get("local_destino") or "").strip()
    if not (uf == "EX" or local == "3" or pais not in ("", "1058")):
        return False
    cnpj = str(sap.get("cnpj_destinatario") or "").strip()
    cpf = str(sap.get("cpf_destinatario") or "").strip()
    if any(ch.isalpha() for ch in cnpj):
        return False
    if len(_digits(cnpj)) == 14 or len(_digits(cpf)) == 11:
        return False
    return True


def patch_id_estrangeiro(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Export destinations without BR CNPJ/CPF must use idEstrangeiro before xNome."""
    if not _is_foreign_dest(sap):
        return
    dest = _find(xml, "dest")
    if dest is None:
        return
    # Drop empty CNPJ/CPF tags
    for tag in ("CNPJ", "CPF"):
        child = _child(dest, tag)
        if child is not None and not (child.text or "").strip():
            dest.remove(child)
    if _child(dest, "idEstrangeiro") is None:
        id_estr = str(sap.get("id_estrangeiro_destinatario") or "")
        if id_estr in ("0", "00"):
            id_estr = ""
        el = etree.Element(_ns_tag("idEstrangeiro"))
        el.text = id_estr
        xnome = _child(dest, "xNome")
        if xnome is not None:
            xnome.addprevious(el)
        else:
            dest.insert(0, el)


def patch_exterior_destinatario(xml: etree._Element, sap: dict[str, Any]) -> None:
    """SEFAZ exterior address: UF EX, cMun 9999999, xMun EXTERIOR, no short CEP."""
    if not _is_foreign_dest(sap):
        return
    dest = _find(xml, "dest")
    if dest is None:
        return
    ender = _child(dest, "enderDest")
    if ender is not None:
        _set_child_text(ender, "cMun", "9999999")
        _set_child_text(ender, "xMun", "EXTERIOR")
        _set_child_text(ender, "UF", "EX")
        cep = _child(ender, "CEP")
        if cep is not None and len(_digits(cep.text)) != 8:
            ender.remove(cep)
    ind = _child(dest, "indIEDest")
    if ind is None:
        el = etree.Element(_ns_tag("indIEDest"))
        el.text = "9"
        if ender is not None:
            ender.addnext(el)
        else:
            dest.append(el)
    else:
        ind.text = "9"
    ie = _child(dest, "IE")
    if ie is not None and not (ie.text or "").strip():
        dest.remove(ie)


def patch_cnpj_documents(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Re-apply CNPJ after PyNFe ``so_numeros()`` strips letters (NT 2026.004).

    Without this, an alphanumeric dest CNPJ becomes a short digit string and
    SEFAZ rejects with cStat 215 / TCnpj pattern failure.
    """
    from nfe_gateway.sefaz.cnpj_doc import CnpjDocError, normalize_cnpj

    emit = _find(xml, "emit")
    if emit is not None:
        cnpj_el = _child(emit, "CNPJ")
        raw = sap.get("cnpj_emitente")
        if cnpj_el is not None and raw not in (None, ""):
            try:
                cnpj_el.text = normalize_cnpj(raw, field="cnpj_emitente")
            except CnpjDocError:
                pass

    dest = _find(xml, "dest")
    if dest is not None and _child(dest, "CPF") is None and _child(dest, "idEstrangeiro") is None:
        raw = sap.get("cnpj_destinatario")
        if raw not in (None, ""):
            try:
                cleaned = normalize_cnpj(raw, field="cnpj_destinatario")
            except CnpjDocError:
                cleaned = None
            if cleaned:
                cnpj_el = _child(dest, "CNPJ")
                if cnpj_el is None:
                    cnpj_el = etree.Element(_nfe_qname(dest, "CNPJ"))
                    xnome = _child(dest, "xNome")
                    if xnome is not None:
                        xnome.addprevious(cnpj_el)
                    else:
                        dest.insert(0, cnpj_el)
                cnpj_el.text = cleaned

    auts = _find_all(xml, "autXML")
    pessoas = sap.get("pessoas_autorizadas") or []
    for idx, aut in enumerate(auts):
        if idx >= len(pessoas) or not isinstance(pessoas[idx], dict):
            continue
        person = pessoas[idx]
        raw = person.get("cnpj") or person.get("cpf")
        if raw in (None, ""):
            continue
        digit_len = len("".join(ch for ch in str(raw) if ch.isdigit()))
        if any(ch.isalpha() for ch in str(raw)) or digit_len != 11:
            try:
                cleaned = normalize_cnpj(raw, field="pessoas_autorizadas.cnpj")
            except CnpjDocError:
                continue
            cpf_el = _child(aut, "CPF")
            if cpf_el is not None:
                aut.remove(cpf_el)
            cnpj_el = _child(aut, "CNPJ")
            if cnpj_el is None:
                cnpj_el = etree.SubElement(aut, _nfe_qname(aut, "CNPJ"))
            cnpj_el.text = cleaned


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


def patch_aut_xml_bahia(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Ensure autXML for Bahia issuers (SEFAZ cStat 486).

    BA requires the accounting-office identification in ``autXML``. When SAP
    sends an empty ``pessoas_autorizadas`` (common), inject the SEFAZ-BA CNPJ
    documented as the no-accountant fallback (NT 2015.002 / SEFAZ-BA guidance).
    """
    if _find_all(xml, "autXML"):
        return
    emit = _find(xml, "emit")
    ender = _find(emit, "enderEmit") if emit is not None else None
    uf = (_child_text(ender, "UF") or str(sap.get("uf_emitente") or "")).upper()
    if uf != "BA":
        return
    inf = _find(xml, "infNFe")
    if inf is None:
        return
    # Schema order: … dest / retirada / entrega / autXML* / det …
    anchor = _child(inf, "entrega")
    if anchor is None:
        anchor = _child(inf, "retirada")
    if anchor is None:
        anchor = _child(inf, "dest")
    if anchor is None:
        anchor = _child(inf, "emit")
    aut = _append_nfe_child(inf, "autXML", after=anchor)
    if aut is None:
        return
    etree.SubElement(aut, _nfe_qname(aut, "CNPJ")).text = SEFAZ_BA_AUTXML_CNPJ


def patch_ibscbs_tot(xml: etree._Element, sap: dict[str, Any] | None = None) -> None:
    """Rebuild IBSCBSTot as the sum of the item IBSCBS groups (SEFAZ cStat 1080+).

    Kept for callers/tests; the pipeline uses ``apply_ibscbs_nfe``, which
    builds the items and calls the same totalizer. SAP header totals are
    ignored: totals must equal the serialized items.
    """
    del sap
    rebuild_ibscbs_tot(xml)


def _dec(text: str | None) -> Decimal:
    try:
        return Decimal(str(text or "0").strip() or "0")
    except Exception:
        return Decimal("0")


def _set_child_text(parent: etree._Element, local: str, value: str) -> None:
    child = _child(parent, local)
    if child is None:
        child = etree.SubElement(parent, _ns_tag(local))
    child.text = value


def _reorder_children(parent: etree._Element, preferred: tuple[str, ...]) -> None:
    """Move known children into schema order; leave unknown siblings after them."""
    by_name: dict[str, etree._Element] = {}
    others: list[etree._Element] = []
    for child in list(parent):
        local = _local(child)
        if local in preferred and local not in by_name:
            by_name[local] = child
        else:
            others.append(child)
    for child in list(parent):
        parent.remove(child)
    for name in preferred:
        if name in by_name:
            parent.append(by_name[name])
    for child in others:
        parent.append(child)


def _ensure_ibs_tot_group(
    parent: etree._Element,
    group_local: str,
    fields: tuple[tuple[str, str], ...],
    *,
    overwrite: bool = False,
) -> etree._Element:
    group = _child(parent, group_local)
    if group is None:
        group = etree.SubElement(parent, _ns_tag(group_local))
    for tag, val in fields:
        existing = _child(group, tag)
        if existing is None:
            etree.SubElement(group, _ns_tag(tag)).text = val
        elif overwrite:
            existing.text = val
    return group


def ensure_empty_payment(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Ensure pag/detPag exists and satisfies SEFAZ payment rules (cStat 441).

    An empty ``<pag/>`` is later stripped and SEFAZ then reports a schema
    failure naming the next sibling (often infAdic). ``tPag=99`` also requires
    ``xPag`` even when SAP sends an empty ``descricao_pagamento``.
    """
    fin = str(sap.get("finalidade_emissao") or "1")
    inf = _find(xml, "infNFe")
    pag = _child(inf, "pag") if inf is not None else _find(xml, "pag")
    if pag is None and inf is not None:
        anchor = _child(inf, "cobr")
        if anchor is None:
            anchor = _child(inf, "transp")
        if anchor is None:
            anchor = _child(inf, "total")
        pag = _append_nfe_child(inf, "pag", after=anchor)
    if pag is None:
        return
    if _child(pag, "detPag") is None:
        formas = [item for item in (sap.get("formas_pagamento") or []) if isinstance(item, dict)]
        if fin in ("3", "4") or not formas:
            _append_sem_pagamento(pag)
        else:
            for item in formas:
                _append_det_pag(pag, item)
            if _child(pag, "detPag") is None:
                _append_sem_pagamento(pag)
    _ensure_det_pag_xpag(pag, sap)


def _ensure_det_pag_xpag(pag: etree._Element, sap: dict[str, Any]) -> None:
    """cStat 441: tPag=99 (Outros) requires xPag."""
    default_desc = _default_xpag(sap)
    for det in list(pag):
        if _local(det) != "detPag":
            continue
        if _child_text(det, "tPag") != "99":
            continue
        existing = _child(det, "xPag")
        if existing is not None and (existing.text or "").strip():
            continue
        desc = default_desc
        if existing is None:
            _insert_after(det, "tPag", "xPag", desc)
        else:
            existing.text = desc


def _default_xpag(sap: dict[str, Any]) -> str:
    for item in sap.get("formas_pagamento") or []:
        if not isinstance(item, dict):
            continue
        if _tpag(item.get("forma_pagamento")) != "99":
            continue
        desc = str(item.get("descricao_pagamento") or "").strip()
        if desc:
            return desc[:60]
    return "Outros"


def _append_sem_pagamento(pag: etree._Element) -> None:
    det = _sub_nfe(pag, "detPag")
    _sub_nfe(det, "tPag", "90")
    _sub_nfe(det, "vPag", "0.00")


def _append_det_pag(pag: etree._Element, item: dict[str, Any]) -> None:
    det = _sub_nfe(pag, "detPag")
    ind = item.get("indicador_pagamento")
    if ind is not None and str(ind).strip() != "":
        _sub_nfe(det, "indPag", str(ind).strip()[:1])
    tpag = _tpag(item.get("forma_pagamento"))
    _sub_nfe(det, "tPag", tpag)
    if tpag == "99":
        desc = str(item.get("descricao_pagamento") or "").strip() or "Outros"
        _sub_nfe(det, "xPag", desc[:60])
    _sub_nfe(det, "vPag", _fmt2(item.get("valor_pagamento")))


def ensure_payment_troco(xml: etree._Element, sap: dict[str, Any]) -> None:
    """cStat 866: when sum(vPag) > vNF, ``pag/vTroco`` is mandatory.

    SAP often sends ``valor_troco`` (or leaves it 0) while ``formas_pagamento``
    still exceed the NF total — PyNFe never writes ``vTroco``.
    """
    pag = _find(xml, "pag")
    if pag is None:
        return

    total_pag = Decimal("0")
    for det in list(pag):
        if _local(det) != "detPag":
            continue
        total_pag += _dec(_child_text(det, "vPag"))

    icms_tot = _find(xml, "ICMSTot")
    vnf = _dec(_child_text(icms_tot, "vNF") if icms_tot is not None else "")
    if vnf <= 0:
        vnf = _dec(str(sap.get("valor_total") or "0"))

    troco_sap = _dec(str(sap.get("valor_troco") or "0"))
    existing = _child(pag, "vTroco")

    if total_pag > vnf:
        troco = troco_sap if troco_sap > 0 else (total_pag - vnf)
        text = _fmt2(troco)
        if existing is None:
            _sub_nfe(pag, "vTroco", text)
        else:
            existing.text = text
        return

    if troco_sap > 0:
        text = _fmt2(troco_sap)
        if existing is None:
            _sub_nfe(pag, "vTroco", text)
        else:
            existing.text = text
        return

    if existing is not None:
        pag.remove(existing)


def _tpag(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not digits:
        return "99"
    return digits.zfill(2)[-2:]


# Sul/Sudeste except ES. Interstate rate to N/NE/CO/ES from these UFs is 7%.
_SUL_SUDESTE = frozenset({"SP", "RJ", "MG", "PR", "RS", "SC"})
_DESTINO_SETE = frozenset(
    {
        "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
        "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO",
    }
)
_ORIGEM_ALIQUOTA_4 = frozenset({"1", "2", "3", "8"})


def patch_icms_uf_dest(xml: etree._Element, sap: dict[str, Any]) -> None:
    """cStat 694: interstate sale to a non-taxpayer final consumer needs ICMSUFDest.

    PyNFe never writes the group. GRC sends it (zeros on CST 60) plus the three
    ICMSTot share fields, which PyNFe also skips when the amount is zero.
    """
    ide = _find(xml, "ide")
    dest = _find(xml, "dest")
    emit = _find(xml, "emit")
    if ide is None or dest is None:
        return
    if (_child_text(ide, "idDest") != "2") or (_child_text(ide, "indFinal") != "1"):
        return
    if _child_text(dest, "indIEDest") != "9":
        return
    uf_emit = _child_text(_find(emit, "enderEmit") if emit is not None else None, "UF")
    uf_dest = _child_text(_find(dest, "enderDest"), "UF")
    items = [item for item in (sap.get("items") or []) if isinstance(item, dict)]
    inf = _find(xml, "infNFe")
    if inf is None:
        return
    for idx, det in enumerate(child for child in inf if _local(child) == "det"):
        imposto = _child(det, "imposto")
        if imposto is None or _child(imposto, "ICMS") is None or _child(imposto, "ICMSUFDest") is not None:
            continue
        item = items[idx] if idx < len(items) else {}
        orig = _orig(imposto)
        group = etree.Element(_nfe_qname(imposto, "ICMSUFDest"))
        _sub_nfe(group, "vBCUFDest", _fmt2(item.get("icms_uf_dest_base")))
        _sub_nfe(group, "pFCPUFDest", _fmt4(item.get("fcp_uf_dest_aliquota")))
        _sub_nfe(group, "pICMSUFDest", _fmt4(item.get("icms_uf_dest_aliquota")))
        _sub_nfe(group, "pICMSInter", _p_icms_inter(uf_emit, uf_dest, orig, item))
        _sub_nfe(group, "pICMSInterPart", _fmt4(item.get("icms_inter_partilha") or 100))
        _sub_nfe(group, "vFCPUFDest", _fmt2(item.get("fcp_uf_dest_valor")))
        _sub_nfe(group, "vICMSUFDest", _fmt2(item.get("icms_uf_dest_valor")))
        _sub_nfe(group, "vICMSUFRemet", _fmt2(item.get("icms_uf_remet_valor")))
        ibs = _child(imposto, "IBSCBS")
        if ibs is not None:
            ibs.addprevious(group)
        else:
            imposto.append(group)
    _sync_icms_uf_dest_totals(xml)


def _orig(imposto: etree._Element) -> str:
    icms = _child(imposto, "ICMS")
    if icms is None:
        return "0"
    for node in icms.iter():
        if _local(node) == "orig" and (node.text or "").strip():
            return node.text.strip()
    return "0"


def _p_icms_inter(uf_emit: str, uf_dest: str, orig: str, item: dict[str, Any]) -> str:
    informed = item.get("icms_inter_aliquota")
    if informed is not None and str(informed).strip() != "":
        rate = Decimal(str(informed))
        if rate in (Decimal("4"), Decimal("7"), Decimal("12")):
            return f"{rate:.2f}"
    if orig in _ORIGEM_ALIQUOTA_4:
        return "4.00"
    if uf_emit in _SUL_SUDESTE and uf_dest in _DESTINO_SETE:
        return "7.00"
    return "12.00"


def _sync_icms_uf_dest_totals(xml: etree._Element) -> None:
    groups = _find_all(xml, "ICMSUFDest")
    if not groups:
        return
    sums = {"vFCPUFDest": Decimal("0"), "vICMSUFDest": Decimal("0"), "vICMSUFRemet": Decimal("0")}
    for group in groups:
        for tag in sums:
            child = _child(group, tag)
            if child is not None and (child.text or "").strip():
                sums[tag] += Decimal(child.text)
    icms_tot = _find(xml, "ICMSTot")
    if icms_tot is None:
        return
    previous = "vICMSDeson"
    for tag in ("vFCPUFDest", "vICMSUFDest", "vICMSUFRemet"):
        text = f"{sums[tag]:.2f}"
        existing = _child(icms_tot, tag)
        if existing is None:
            _insert_after(icms_tot, previous, tag, text)
        else:
            existing.text = text
        previous = tag


def _child_text(parent: etree._Element | None, local_name: str) -> str:
    if parent is None:
        return ""
    child = _child(parent, local_name)
    return (child.text or "").strip() if child is not None else ""


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


def _set_child_text(parent: etree._Element, local_name: str, text: str) -> None:
    child = _child(parent, local_name)
    if child is None:
        child = etree.SubElement(parent, _ns_tag(local_name))
    child.text = text


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
