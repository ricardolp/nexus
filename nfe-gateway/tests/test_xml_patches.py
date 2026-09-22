"""Unit tests for XML post-processing patches."""

from __future__ import annotations

from lxml import etree

from nfe_gateway.sefaz.xml_patches import (
    apply_all_patches,
    ensure_ean_sem_gtin,
    patch_icms51,
    patch_id_estrangeiro,
    patch_ii_zero_values,
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


def test_patch_ii_zero():
    root = _el("NFe")
    ii = etree.SubElement(root, f"{{{NFE_NS}}}II")
    etree.SubElement(ii, f"{{{NFE_NS}}}vBC").text = "0.01"
    patch_ii_zero_values(root)
    assert ii[0].text == "0.00"


def test_apply_all_patches_idempotent_structure():
    root = _el("NFe")
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe")
    etree.SubElement(inf, f"{{{NFE_NS}}}ide")
    total = etree.SubElement(inf, f"{{{NFE_NS}}}total")
    etree.SubElement(total, f"{{{NFE_NS}}}ICMSTot")
    apply_all_patches(root, {"finalidade_emissao": "3", "formas_pagamento": []})
    pag = [el for el in root.iter() if etree.QName(el).localname == "pag"]
    assert len(pag) == 1
