"""NFref, DFeReferenciado (devolução por item, VC02-14), gCompraGov e gPagAntecipado."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest
from lxml import etree

from nfe_gateway.sefaz.referencias_nfe import devolucao_por_item_ativa
from nfe_gateway.sefaz.sap_nfe import SapNfeMapperError, build_unsigned_xml

NS = "http://www.portalfiscal.inf.br/nfe"
FIXTURES = Path(__file__).parent / "fixtures"
XSD = etree.XMLSchema(etree.parse(str(Path(__file__).parent / "xsd" / "PL_010_v1.50" / "nfe_v4.00.xsd")))

CHAVE_NFE = "35260912345678000195550010000123451123456789"
CHAVE_NFE_2 = "35260912345678000195550010000123461123456780"
CHAVE_CTE = "35260912345678000195570010000000011123456781"
CHAVE_ALFA = "352609ABCDEFGH000195550010000123451123456789"

_TAGS = ("NFref", "refNFe", "refCTe", "refNF", "gCompraGov", "gPagAntecipado", "DFeReferenciado",
         "chaveAcesso", "nItem", "pRedutor", "refDFeAnt", "tpEnteGov", "tpOperGov")


def _sap(**extra) -> dict:
    sap = json.loads((FIXTURES / "sap_nfe_outbound.json").read_text(encoding="utf-8"))
    sap.update(extra)
    return sap


def _ide_names(xml: etree._Element) -> list[str]:
    ide = xml.find(f".//{{{NS}}}ide")
    return [etree.QName(c).localname for c in ide]


def _rtc_xsd_errors(xml: etree._Element) -> list[str]:
    XSD.validate(xml)
    return [str(e) for e in XSD.error_log if "Signature" not in e.message and any(t in e.message for t in _TAGS)]


def test_cutover_dates(monkeypatch):
    monkeypatch.delenv("NFE_DEVOLUCAO_POR_ITEM_PRODUCAO", raising=False)
    monkeypatch.delenv("NFE_DEVOLUCAO_POR_ITEM_HOMOLOGACAO", raising=False)
    assert not devolucao_por_item_ativa(homologacao=False, emissao=date(2026, 11, 15))
    assert devolucao_por_item_ativa(homologacao=False, emissao=date(2026, 11, 16))
    assert not devolucao_por_item_ativa(homologacao=True, emissao=date(2026, 10, 25))
    assert devolucao_por_item_ativa(homologacao=True, emissao=date(2026, 10, 26))
    monkeypatch.setenv("NFE_DEVOLUCAO_POR_ITEM_PRODUCAO", "2026-12-01")
    assert not devolucao_por_item_ativa(homologacao=False, emissao=date(2026, 11, 20))


def test_nfref_is_emitted_from_notas_referenciadas():
    sap = _sap(
        finalidade_emissao="2",
        notas_referenciadas=[
            {"chave_acesso": CHAVE_NFE},
            {"chave_acesso": CHAVE_CTE},
            {"uf": "SP", "ano_mes": "2026-08", "cnpj": "12345678000195", "modelo": "1", "serie": "001", "numero": "000123"},
        ],
    )
    xml = build_unsigned_xml(sap, homologacao=True)
    refs = xml.findall(f".//{{{NS}}}ide/{{{NS}}}NFref")
    assert [etree.QName(r[0]).localname for r in refs] == ["refNFe", "refCTe", "refNF"]
    ref_nf = refs[2][0]
    assert ref_nf.findtext(f"{{{NS}}}cUF") == "35"
    assert ref_nf.findtext(f"{{{NS}}}AAMM") == "2608"
    assert ref_nf.findtext(f"{{{NS}}}serie") == "1"
    assert _rtc_xsd_errors(xml) == []
    names = _ide_names(xml)
    assert names.index("verProc") < names.index("NFref")


def test_invalid_reference_is_a_mapper_error():
    with pytest.raises(SapNfeMapperError, match="chave de acesso inválida"):
        build_unsigned_xml(_sap(notas_referenciadas=[{"chave_acesso": "123"}]), homologacao=True)
    with pytest.raises(SapNfeMapperError, match="modelo 04"):
        build_unsigned_xml(_sap(notas_referenciadas=[{"modelo": "04", "numero": "1"}]), homologacao=True)


def test_alphanumeric_cnpj_key_is_accepted():
    xml = build_unsigned_xml(_sap(notas_referenciadas=[{"chave_acesso": CHAVE_ALFA}]), homologacao=True)
    assert xml.findtext(f".//{{{NS}}}refNFe") == CHAVE_ALFA


def test_item_dfe_referenciado_from_sap(monkeypatch):
    sap = _sap()
    sap["items"][0]["chave_acesso_dfe_referenciado"] = CHAVE_NFE
    sap["items"][0]["numero_item_dfe_referenciado"] = "003"
    xml = build_unsigned_xml(sap, homologacao=True)
    det = xml.find(f".//{{{NS}}}det")
    assert etree.QName(det[-1]).localname == "DFeReferenciado"
    assert det.findtext(f"{{{NS}}}DFeReferenciado/{{{NS}}}chaveAcesso") == CHAVE_NFE
    assert det.findtext(f"{{{NS}}}DFeReferenciado/{{{NS}}}nItem") == "3"
    assert _rtc_xsd_errors(xml) == []


def _devolucao(**extra) -> dict:
    sap = _sap(finalidade_emissao="4", tipo_documento="0", **extra)
    return sap


def test_devolucao_before_cutover_keeps_refnfe(monkeypatch):
    monkeypatch.setenv("NFE_DEVOLUCAO_POR_ITEM_HOMOLOGACAO", "2099-01-01")
    xml = build_unsigned_xml(_devolucao(notas_referenciadas=[{"chave_acesso": CHAVE_NFE}]), homologacao=True)
    assert xml.findtext(f".//{{{NS}}}NFref/{{{NS}}}refNFe") == CHAVE_NFE
    assert xml.find(f".//{{{NS}}}DFeReferenciado") is None


def test_devolucao_after_cutover_moves_reference_to_items(monkeypatch):
    monkeypatch.setenv("NFE_DEVOLUCAO_POR_ITEM_HOMOLOGACAO", "2000-01-01")
    xml = build_unsigned_xml(_devolucao(notas_referenciadas=[{"chave_acesso": CHAVE_NFE}]), homologacao=True)
    assert xml.find(f".//{{{NS}}}refNFe") is None  # VC02-14: refNFe proibido na devolução
    assert xml.findtext(f".//{{{NS}}}DFeReferenciado/{{{NS}}}chaveAcesso") == CHAVE_NFE
    assert _rtc_xsd_errors(xml) == []


def test_devolucao_after_cutover_needs_item_reference(monkeypatch):
    monkeypatch.setenv("NFE_DEVOLUCAO_POR_ITEM_HOMOLOGACAO", "2000-01-01")
    sap = _devolucao(notas_referenciadas=[{"chave_acesso": CHAVE_NFE}, {"chave_acesso": CHAVE_NFE_2}])
    with pytest.raises(SapNfeMapperError, match="VC02-14"):
        build_unsigned_xml(sap, homologacao=True)
    sap["items"][0]["chave_acesso_dfe_referenciado"] = CHAVE_NFE_2
    sap["items"][0]["numero_item_dfe_referenciado"] = 1
    xml = build_unsigned_xml(sap, homologacao=True)
    assert xml.findtext(f".//{{{NS}}}DFeReferenciado/{{{NS}}}chaveAcesso") == CHAVE_NFE_2


def test_compra_governamental_and_pagamento_antecipado():
    sap = _sap(
        tipo_compra_governamental="1",
        tipo_operacao_governamental="1",
        perc_reducao_aliq_compra_gov=10,
        chaves_acesso_dfe_anteriores=[{"chave_dfe": CHAVE_NFE_2}],
        chaves_nfe_antecipacao_pagamento=[{"chave_nfe": CHAVE_NFE}],
        notas_referenciadas=[{"chave_acesso": CHAVE_NFE}],
    )
    sap["items"][0].update({
        "ibs_aliquota_competencia_uf": 0.1, "ibs_valor_tributo_calculado_uf": 1.0,
        "ibs_aliquota_compet_mun": 0, "ibs_valor_tributo_calc_mun": 0,
        "cbs_aliquota_compra_governamen": 0.9, "cbs_valor_tributo_calculado": 9.0,
        "ibs_valor_uf": 0.9, "ibs_valor": 0.9, "cbs_valor": 8.1,
    })
    xml = build_unsigned_xml(sap, homologacao=True)
    names = _ide_names(xml)
    assert names[-3:] == ["NFref", "gCompraGov", "gPagAntecipado"]
    gov = xml.find(f".//{{{NS}}}gCompraGov")
    assert [etree.QName(c).localname for c in gov] == ["tpEnteGov", "pRedutor", "tpOperGov", "refDFeAnt"]
    assert gov.findtext(f"{{{NS}}}pRedutor") == "10.0000"
    assert xml.find(f".//{{{NS}}}gTribCompraGov") is not None
    assert _rtc_xsd_errors(xml) == []
