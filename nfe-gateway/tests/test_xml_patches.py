"""Unit tests for XML post-processing patches."""

from __future__ import annotations

from lxml import etree

from nfe_gateway.sefaz.xml_patches import (
    SEFAZ_BA_AUTXML_CNPJ,
    apply_all_patches,
    ensure_ean_sem_gtin,
    patch_aut_xml_bahia,
    patch_ibscbs_tot,
    patch_icms51,
    patch_id_estrangeiro,
    patch_exterior_destinatario,
    patch_ii_zero_values,
    patch_ver_proc,
)

NFE_NS = "http://www.portalfiscal.inf.br/nfe"


def _el(tag: str, text: str | None = None, **attrs) -> etree._Element:
    el = etree.Element(f"{{{NFE_NS}}}{tag}", nsmap={None: NFE_NS})
    if text is not None:
        el.text = text
    for k, v in attrs.items():
        el.set(k, v)
    return el


def test_ensure_ean_sem_gtin():
    root = _el("NFe")
    prod = etree.SubElement(root, f"{{{NFE_NS}}}prod")
    ean = etree.SubElement(prod, f"{{{NFE_NS}}}cEAN")
    ean.text = ""
    ensure_ean_sem_gtin(root)
    assert ean.text == "SEM GTIN"


def test_patch_icms51_injects_fields():
    root = _el("NFe")
    icms = etree.SubElement(root, f"{{{NFE_NS}}}ICMS51")
    etree.SubElement(icms, f"{{{NFE_NS}}}orig").text = "0"
    etree.SubElement(icms, f"{{{NFE_NS}}}CST").text = "51"
    etree.SubElement(icms, f"{{{NFE_NS}}}modBC").text = "3"
    sap = {
        "items": [
            {
                "icms_base": 1000,
                "icms_aliquota": 18,
                "icms_valor_operacao": 180,
                "icms_percentual_diferimento": 100,
                "icms_valor_diferido": 180,
            }
        ]
    }
    patch_icms51(root, sap)
    texts = {etree.QName(c).localname: c.text for c in icms}
    assert texts["vBC"] == "1000.00"
    assert texts["pICMS"] == "18.0000"
    assert texts["vICMSOp"] == "180.00"
    assert texts["pDif"] == "100.0000"
    assert texts["vICMSDif"] == "180.00"


def test_patch_id_estrangeiro_export():
    root = _el("NFe")
    dest = etree.SubElement(root, f"{{{NFE_NS}}}dest")
    etree.SubElement(dest, f"{{{NFE_NS}}}CNPJ").text = ""
    etree.SubElement(dest, f"{{{NFE_NS}}}xNome").text = "FOREIGN BUYER"
    sap = {
        "uf_destinatario": "EX",
        "codigo_pais_destinatario": "2496",
        "id_estrangeiro_destinatario": "ABC123",
        "cnpj_destinatario": "",
        "cpf_destinatario": "",
    }
    patch_id_estrangeiro(root, sap)
    tags = [etree.QName(c).localname for c in dest]
    assert "idEstrangeiro" in tags
    assert tags.index("idEstrangeiro") < tags.index("xNome")
    assert "CNPJ" not in tags


def test_patch_exterior_destinatario_normaliza_endereco():
    root = _el("NFe")
    dest = etree.SubElement(root, f"{{{NFE_NS}}}dest")
    etree.SubElement(dest, f"{{{NFE_NS}}}CNPJ").text = ""
    etree.SubElement(dest, f"{{{NFE_NS}}}xNome").text = "FOREIGN BUYER"
    ender = etree.SubElement(dest, f"{{{NFE_NS}}}enderDest")
    etree.SubElement(ender, f"{{{NFE_NS}}}xMun").text = "Dongan-Gu"
    etree.SubElement(ender, f"{{{NFE_NS}}}UF").text = "08"
    etree.SubElement(ender, f"{{{NFE_NS}}}CEP").text = "123517"
    etree.SubElement(dest, f"{{{NFE_NS}}}indIEDest").text = "1"
    etree.SubElement(dest, f"{{{NFE_NS}}}IE").text = ""
    sap = {
        "local_destino": "3",
        "uf_destinatario": "08",
        "codigo_pais_destinatario": "1902",
        "id_estrangeiro_destinatario": "1388147556",
        "cnpj_destinatario": "",
        "cpf_destinatario": "",
    }
    patch_exterior_destinatario(root, sap)
    addr = {etree.QName(c).localname: (c.text or "") for c in ender}
    assert addr["cMun"] == "9999999"
    assert addr["xMun"] == "EXTERIOR"
    assert addr["UF"] == "EX"
    assert "CEP" not in addr
    tags = {etree.QName(c).localname: (c.text or "") for c in dest}
    assert tags["indIEDest"] == "9"
    assert "IE" not in tags


def test_patch_ii_zero():
    root = _el("NFe")
    ii = etree.SubElement(root, f"{{{NFE_NS}}}II")
    etree.SubElement(ii, f"{{{NFE_NS}}}vBC").text = "0.01"
    patch_ii_zero_values(root)
    assert ii[0].text == "0.00"


def test_patch_aut_xml_bahia_injects_sefaz_cnpj_when_missing():
    """cStat 486: BA requires autXML; empty pessoas_autorizadas → SEFAZ-BA CNPJ."""
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    emit = etree.SubElement(inf, f"{{{NFE_NS}}}emit")
    ender = etree.SubElement(emit, f"{{{NFE_NS}}}enderEmit")
    etree.SubElement(ender, f"{{{NFE_NS}}}UF").text = "BA"
    dest = etree.SubElement(inf, f"{{{NFE_NS}}}dest")
    etree.SubElement(dest, f"{{{NFE_NS}}}CNPJ").text = "05523987000304"
    det = etree.SubElement(inf, f"{{{NFE_NS}}}det", nItem="1")
    etree.SubElement(det, f"{{{NFE_NS}}}prod")

    patch_aut_xml_bahia(root, {})

    names = [etree.QName(c).localname for c in inf]
    assert "autXML" in names
    assert names.index("dest") < names.index("autXML") < names.index("det")
    aut = next(el for el in inf if etree.QName(el).localname == "autXML")
    assert {etree.QName(c).localname: c.text for c in aut} == {"CNPJ": SEFAZ_BA_AUTXML_CNPJ}


def test_patch_aut_xml_bahia_skips_when_already_present():
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    emit = etree.SubElement(inf, f"{{{NFE_NS}}}emit")
    ender = etree.SubElement(emit, f"{{{NFE_NS}}}enderEmit")
    etree.SubElement(ender, f"{{{NFE_NS}}}UF").text = "BA"
    aut = etree.SubElement(inf, f"{{{NFE_NS}}}autXML")
    etree.SubElement(aut, f"{{{NFE_NS}}}CPF").text = "06650990612"

    patch_aut_xml_bahia(root, {})

    auts = [el for el in inf if etree.QName(el).localname == "autXML"]
    assert len(auts) == 1
    assert auts[0][0].text == "06650990612"


def test_patch_aut_xml_bahia_skips_other_uf():
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    emit = etree.SubElement(inf, f"{{{NFE_NS}}}emit")
    ender = etree.SubElement(emit, f"{{{NFE_NS}}}enderEmit")
    etree.SubElement(ender, f"{{{NFE_NS}}}UF").text = "SP"

    patch_aut_xml_bahia(root, {})

    assert not any(etree.QName(el).localname == "autXML" for el in inf)


def test_patch_ibscbs_tot_completes_g_ibs_schema():
    """cStat 215: gIBS with only gIBSUF is incomplete — SEFAZ expects gIBSMun next."""
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    det = etree.SubElement(inf, f"{{{NFE_NS}}}det", nItem="1")
    imposto = etree.SubElement(det, f"{{{NFE_NS}}}imposto")
    ibs = etree.SubElement(imposto, f"{{{NFE_NS}}}IBSCBS")
    etree.SubElement(ibs, f"{{{NFE_NS}}}CST").text = "410"
    etree.SubElement(ibs, f"{{{NFE_NS}}}cClassTrib").text = "410002"
    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    ibs_tot = etree.SubElement(total, f"{{{NFE_NS}}}IBSCBSTot")
    etree.SubElement(ibs_tot, f"{{{NFE_NS}}}vBCIBSCBS").text = "0.00"
    g_ibs = etree.SubElement(ibs_tot, f"{{{NFE_NS}}}gIBS")
    g_uf = etree.SubElement(g_ibs, f"{{{NFE_NS}}}gIBSUF")
    etree.SubElement(g_uf, f"{{{NFE_NS}}}vDif").text = "0.00"
    etree.SubElement(g_uf, f"{{{NFE_NS}}}vDevTrib").text = "0.00"
    etree.SubElement(g_uf, f"{{{NFE_NS}}}vIBSUF").text = "0.00"

    patch_ibscbs_tot(
        root,
        {
            "ibs_uf_valor_total": 0,
            "ibs_mun_valor_total": 0,
            "ibs_valor_total": 0,
            "cbs_valor_total": 0,
            "ibs_base_calculo": 0,
        },
    )

    g_ibs = next(el for el in ibs_tot if etree.QName(el).localname == "gIBS")
    names = [etree.QName(c).localname for c in g_ibs]
    assert names == ["gIBSUF", "gIBSMun", "vIBS", "vCredPres", "vCredPresCondSus"]
    g_mun = next(el for el in g_ibs if etree.QName(el).localname == "gIBSMun")
    mun_texts = {etree.QName(c).localname: c.text for c in g_mun}
    assert mun_texts == {"vDif": "0.00", "vDevTrib": "0.00", "vIBSMun": "0.00"}
    tot_names = [etree.QName(c).localname for c in ibs_tot]
    assert tot_names.index("gIBS") < tot_names.index("gCBS")
    g_cbs = next(el for el in ibs_tot if etree.QName(el).localname == "gCBS")
    assert {etree.QName(c).localname for c in g_cbs} >= {
        "vDif",
        "vDevTrib",
        "vCBS",
        "vCredPres",
        "vCredPresCondSus",
    }


def test_patch_ibscbs_tot_creates_full_group_when_missing():
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    det = etree.SubElement(inf, f"{{{NFE_NS}}}det", nItem="1")
    imposto = etree.SubElement(det, f"{{{NFE_NS}}}imposto")
    ibs = etree.SubElement(imposto, f"{{{NFE_NS}}}IBSCBS")
    etree.SubElement(ibs, f"{{{NFE_NS}}}CST").text = "410"
    etree.SubElement(ibs, f"{{{NFE_NS}}}cClassTrib").text = "410002"
    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    etree.SubElement(total, f"{{{NFE_NS}}}ICMSTot")

    patch_ibscbs_tot(root, {"ibs_base_calculo": 0})

    ibs_tot = next(el for el in total if etree.QName(el).localname == "IBSCBSTot")
    assert [etree.QName(c).localname for c in ibs_tot][:3] == ["vBCIBSCBS", "gIBS", "gCBS"]


def test_patch_ibscbs_tot_overwrites_doubled_header_with_item_sum():
    """cStat 1080: total vIBSUF must equal sum of item vIBSUF (not header+items)."""
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    det = etree.SubElement(inf, f"{{{NFE_NS}}}det", nItem="1")
    imposto = etree.SubElement(det, f"{{{NFE_NS}}}imposto")
    ibs = etree.SubElement(imposto, f"{{{NFE_NS}}}IBSCBS")
    etree.SubElement(ibs, f"{{{NFE_NS}}}CST").text = "000"
    etree.SubElement(ibs, f"{{{NFE_NS}}}cClassTrib").text = "000001"
    g = etree.SubElement(ibs, f"{{{NFE_NS}}}gIBSCBS")
    etree.SubElement(g, f"{{{NFE_NS}}}vBC").text = "3317.32"
    g_uf = etree.SubElement(g, f"{{{NFE_NS}}}gIBSUF")
    etree.SubElement(g_uf, f"{{{NFE_NS}}}pIBSUF").text = "0.1000"
    etree.SubElement(g_uf, f"{{{NFE_NS}}}vIBSUF").text = "3.32"
    g_mun = etree.SubElement(g, f"{{{NFE_NS}}}gIBSMun")
    etree.SubElement(g_mun, f"{{{NFE_NS}}}pIBSMun").text = "0.0000"
    etree.SubElement(g_mun, f"{{{NFE_NS}}}vIBSMun").text = "0.00"
    etree.SubElement(g, f"{{{NFE_NS}}}vIBS").text = "3.32"
    g_cbs = etree.SubElement(g, f"{{{NFE_NS}}}gCBS")
    etree.SubElement(g_cbs, f"{{{NFE_NS}}}pCBS").text = "0.9000"
    etree.SubElement(g_cbs, f"{{{NFE_NS}}}vCBS").text = "29.86"

    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    ibs_tot = etree.SubElement(total, f"{{{NFE_NS}}}IBSCBSTot")
    etree.SubElement(ibs_tot, f"{{{NFE_NS}}}vBCIBSCBS").text = "3317.32"
    g_ibs = etree.SubElement(ibs_tot, f"{{{NFE_NS}}}gIBS")
    tot_uf = etree.SubElement(g_ibs, f"{{{NFE_NS}}}gIBSUF")
    etree.SubElement(tot_uf, f"{{{NFE_NS}}}vDif").text = "0.00"
    etree.SubElement(tot_uf, f"{{{NFE_NS}}}vDevTrib").text = "0.00"
    etree.SubElement(tot_uf, f"{{{NFE_NS}}}vIBSUF").text = "6.64"  # doubled bug
    tot_mun = etree.SubElement(g_ibs, f"{{{NFE_NS}}}gIBSMun")
    etree.SubElement(tot_mun, f"{{{NFE_NS}}}vDif").text = "0.00"
    etree.SubElement(tot_mun, f"{{{NFE_NS}}}vDevTrib").text = "0.00"
    etree.SubElement(tot_mun, f"{{{NFE_NS}}}vIBSMun").text = "0.00"
    etree.SubElement(g_ibs, f"{{{NFE_NS}}}vIBS").text = "6.64"
    tot_cbs = etree.SubElement(ibs_tot, f"{{{NFE_NS}}}gCBS")
    etree.SubElement(tot_cbs, f"{{{NFE_NS}}}vCBS").text = "59.72"

    patch_ibscbs_tot(root, {"ibs_uf_valor_total": 3.32, "cbs_valor_total": 29.86})

    g_ibs = next(el for el in ibs_tot if etree.QName(el).localname == "gIBS")
    uf = next(el for el in g_ibs if etree.QName(el).localname == "gIBSUF")
    assert next(c.text for c in uf if etree.QName(c).localname == "vIBSUF") == "3.32"
    assert next(c.text for c in g_ibs if etree.QName(c).localname == "vIBS") == "3.32"
    cbs = next(el for el in ibs_tot if etree.QName(el).localname == "gCBS")
    assert next(c.text for c in cbs if etree.QName(c).localname == "vCBS") == "29.86"


def test_payment_tpag_99_requires_xpag_even_when_descricao_empty():
    """cStat 441: meio 99-outros exige xPag; SAP often sends descricao_pagamento=''."""
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    etree.SubElement(inf, f"{{{NFE_NS}}}total")
    pag = etree.SubElement(inf, f"{{{NFE_NS}}}pag")
    det = etree.SubElement(pag, f"{{{NFE_NS}}}detPag")
    etree.SubElement(det, f"{{{NFE_NS}}}tPag").text = "99"
    etree.SubElement(det, f"{{{NFE_NS}}}vPag").text = "2408.38"

    apply_all_patches(
        root,
        {
            "finalidade_emissao": "1",
            "formas_pagamento": [
                {
                    "forma_pagamento": "99",
                    "descricao_pagamento": "",
                    "valor_pagamento": 2408.38,
                }
            ],
        },
    )
    texts = {etree.QName(c).localname: c.text for c in det}
    assert texts["tPag"] == "99"
    assert texts["xPag"] == "Outros"
    assert texts["vPag"] == "2408.38"
    names = [etree.QName(c).localname for c in det]
    assert names.index("tPag") < names.index("xPag") < names.index("vPag")


def test_payment_group_precedes_inf_adic():
    """Missing pag makes SEFAZ 225 name the next element, infAdic."""
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    etree.SubElement(inf, f"{{{NFE_NS}}}total")
    transp = etree.SubElement(inf, f"{{{NFE_NS}}}transp")
    etree.SubElement(transp, f"{{{NFE_NS}}}modFrete").text = "9"
    etree.SubElement(inf, f"{{{NFE_NS}}}pag")
    inf_adic = etree.SubElement(inf, f"{{{NFE_NS}}}infAdic")
    etree.SubElement(inf_adic, f"{{{NFE_NS}}}infCpl").text = "ICMS ST"
    apply_all_patches(
        root,
        {
            "finalidade_emissao": "1",
            "formas_pagamento": [
                {
                    "indicador_pagamento": "0",
                    "forma_pagamento": "1",
                    "valor_pagamento": 382.20,
                }
            ],
        },
    )
    names = [etree.QName(child).localname for child in inf]
    assert names.index("transp") < names.index("pag") < names.index("infAdic")
    det = next(el for el in inf if etree.QName(el).localname == "pag")
    texts = {etree.QName(c).localname: c.text for c in det[0]}
    assert texts["indPag"] == "0"
    assert texts["tPag"] == "01"
    assert texts["vPag"] == "382.20"


def test_payment_troco_when_vpag_exceeds_vnf():
    """cStat 866: sum(vPag) > vNF requires pag/vTroco."""
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    icms_tot = etree.SubElement(total, f"{{{NFE_NS}}}ICMSTot")
    etree.SubElement(icms_tot, f"{{{NFE_NS}}}vNF").text = "100.00"
    pag = etree.SubElement(inf, f"{{{NFE_NS}}}pag")
    det = etree.SubElement(pag, f"{{{NFE_NS}}}detPag")
    etree.SubElement(det, f"{{{NFE_NS}}}tPag").text = "01"
    etree.SubElement(det, f"{{{NFE_NS}}}vPag").text = "150.00"

    apply_all_patches(
        root,
        {
            "finalidade_emissao": "1",
            "valor_total": 100.00,
            "valor_troco": 0,
            "formas_pagamento": [
                {"forma_pagamento": "1", "valor_pagamento": 150.00},
            ],
        },
    )
    vtroco = next(c for c in pag if etree.QName(c).localname == "vTroco")
    assert vtroco.text == "50.00"
    names = [etree.QName(c).localname for c in pag]
    assert names.index("detPag") < names.index("vTroco")


def test_payment_troco_uses_sap_valor_troco_when_set():
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    icms_tot = etree.SubElement(total, f"{{{NFE_NS}}}ICMSTot")
    etree.SubElement(icms_tot, f"{{{NFE_NS}}}vNF").text = "100.00"
    pag = etree.SubElement(inf, f"{{{NFE_NS}}}pag")
    det = etree.SubElement(pag, f"{{{NFE_NS}}}detPag")
    etree.SubElement(det, f"{{{NFE_NS}}}tPag").text = "01"
    etree.SubElement(det, f"{{{NFE_NS}}}vPag").text = "120.00"

    apply_all_patches(
        root,
        {
            "finalidade_emissao": "1",
            "valor_troco": 20.00,
            "formas_pagamento": [
                {"forma_pagamento": "1", "valor_pagamento": 120.00},
            ],
        },
    )
    vtroco = next(c for c in pag if etree.QName(c).localname == "vTroco")
    assert vtroco.text == "20.00"


def test_apply_all_patches_idempotent_structure():
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    etree.SubElement(inf, f"{{{NFE_NS}}}ide")
    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    etree.SubElement(total, f"{{{NFE_NS}}}ICMSTot")
    apply_all_patches(root, {"finalidade_emissao": "3", "formas_pagamento": []})
    pag = [el for el in root.iter() if etree.QName(el).localname == "pag"]
    assert len(pag) == 1


def test_patch_ver_proc_replaces_pynfe():
    root = _el("NFe")
    ide = etree.SubElement(root, f"{{{NFE_NS}}}ide")
    ver = etree.SubElement(ide, f"{{{NFE_NS}}}verProc")
    ver.text = "PyNFe 0.6.0"
    patch_ver_proc(root)
    assert ver.text == "nexus"
