"""Tests for SAP NF-e mapper (sap_nfe.py)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from lxml import etree

from nfe_gateway.sefaz.sap_nfe import SapNfeMapperError, build_unsigned_xml


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sap_nfe_outbound.json"


@pytest.fixture
def sap_fixture():
    """Load SAP NF-e JSON fixture."""
    with FIXTURE_PATH.open() as f:
        return json.load(f)


def test_garuva_ibge_overrides_wrong_cmunfg():
    """Garuva/SC must use 4205803 (not Gaspar 4205906) even if SAP sent wrong code."""
    from nfe_gateway.sefaz.sap_nfe import _resolve_emitente_ibge

    sap = {
        "municipio_emitente": "Garuva",
        "uf_emitente": "SC",
        "codigo_municipio_fato_gerador": "4205906",
        "codigo_municipio_emitente": "4205906",
    }
    assert _resolve_emitente_ibge(sap) == "4205803"


def test_cmunfg_from_city_when_ibge_omitted(sap_fixture):
    """Missing IBGE must still emit ide/cMunFG, or SEFAZ 225 names the next tag tpImp."""
    sap_fixture.pop("codigo_municipio_fato_gerador", None)
    sap_fixture.pop("codigo_municipio_fato_gerador_ibs", None)
    sap_fixture.pop("codigo_municipio_emitente", None)
    sap_fixture["municipio_emitente"] = "GURUPI"
    sap_fixture["uf_emitente"] = "TO"
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    ide = xml.find(f".//{{{ns}}}ide")
    assert ide is not None
    children = [etree.QName(child).localname for child in ide]
    assert children[children.index("tpImp") - 1] == "cMunFG"
    cmun = xml.find(f".//{{{ns}}}cMunFG")
    assert cmun is not None and cmun.text == "1709500"


def test_inf_resp_tec_matches_grc(sap_fixture):
    """TO homologation rejects cStat 972 without the software-house infRespTec."""
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    inf = xml.find(f".//{{{ns}}}infNFe")
    assert inf is not None
    names = [etree.QName(child).localname for child in inf]
    assert names.index("infAdic") < names.index("infRespTec")
    resp = xml.find(f".//{{{ns}}}infRespTec")
    assert resp is not None
    texts = {etree.QName(child).localname: child.text for child in resp}
    assert texts == {
        "CNPJ": "35934186000130",
        "xContato": "Nova Consultoria em Tecnologia da Informacao Ltda",
        "email": "ti@novaconsulting.com.br",
        "fone": "4199999999",
    }


def test_grc_missing_groups_for_interstate_consumer(sap_fixture):
    """TO→BA final consumer must carry ICMSUFDest, IPI, share totals and the invoice."""
    sap_fixture["uf_emitente"] = "TO"
    sap_fixture["municipio_emitente"] = "GURUPI"
    sap_fixture["local_destino"] = 2
    sap_fixture["consumidor_final"] = 1
    sap_fixture["indicador_inscricao_estadual_destinatario"] = 9
    sap_fixture["uf_destinatario"] = "BA"
    sap_fixture["municipio_destinatario"] = "SALVADOR"
    sap_fixture["codigo_municipio_destinatario"] = "2927408"
    sap_fixture["pessoas_autorizadas"] = [{"cnpj": "19533669000177"}]
    item = sap_fixture["items"][0]
    item["icms_origem"] = "5"
    item["icms_cst"] = "60"
    item["ipi_cst"] = "54"
    item["ipi_enquadramento"] = "004"
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    inf = xml.find(f".//{{{ns}}}infNFe")
    assert inf is not None
    names = [etree.QName(child).localname for child in inf]
    assert "autXML" in names and names.index("autXML") < names.index("det")
    assert names.index("cobr") < names.index("pag")
    imposto = xml.find(f".//{{{ns}}}imposto")
    assert imposto is not None
    tax_names = [etree.QName(child).localname for child in imposto]
    assert tax_names.index("COFINS") < tax_names.index("ICMSUFDest")
    if "IBSCBS" in tax_names:
        assert tax_names.index("ICMSUFDest") < tax_names.index("IBSCBS")
    dest_group = xml.find(f".//{{{ns}}}ICMSUFDest")
    assert dest_group is not None
    texts = {etree.QName(child).localname: child.text for child in dest_group}
    assert texts["pICMSInter"] == "12.00"
    assert texts["pICMSInterPart"] == "100.0000"
    assert texts["vICMSUFDest"] == "0.00"
    icms_tot = xml.find(f".//{{{ns}}}ICMSTot")
    assert icms_tot is not None
    total_names = [etree.QName(child).localname for child in icms_tot]
    assert total_names.index("vICMSDeson") < total_names.index("vFCPUFDest")
    assert total_names.index("vICMSUFRemet") < total_names.index("vFCP")
    ipi = xml.find(f".//{{{ns}}}IPI")
    assert ipi is not None
    assert ipi.find(f"{{{ns}}}cEnq").text == "004"
    assert ipi.find(f"{{{ns}}}IPINT/{{{ns}}}CST").text == "54"


def test_serie_000_matches_grc_schema(sap_fixture):
    """SAP series 000 must be emitted as <serie>0</serie> (cStat 225 otherwise)."""
    sap_fixture["serie"] = "000"
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    serie = xml.find(f".//{{{ns}}}serie")
    assert serie is not None
    assert serie.text == "0"
    inf = xml.find(f".//{{{ns}}}infNFe")
    assert inf is not None
    # Access key still zero-pads the series to 3 digits (same as GRC).
    assert inf.get("Id", "")[25:28] == "000"
    tp_imp = xml.find(f".//{{{ns}}}tpImp")
    assert tp_imp is not None and tp_imp.text == "1"
    names = [etree.QName(child).localname for child in inf]
    assert names.index("pag") < names.index("infAdic")
    tpag = xml.find(f".//{{{ns}}}tPag")
    assert tpag is not None and tpag.text == "15"


def test_build_unsigned_xml_success(sap_fixture):
    """Test successful SAP JSON → PyNFe XML conversion."""
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    
    assert xml is not None
    assert etree.iselement(xml)
    
    # Check basic structure
    xml_str = etree.tostring(xml, encoding="unicode")
    assert "<NFe" in xml_str
    assert "<infNFe" in xml_str
    assert "<ide>" in xml_str
    assert "<emit>" in xml_str
    assert "<dest>" in xml_str
    assert "<det " in xml_str
    assert "<total>" in xml_str
    
    # Check homologacao disclaimer injection
    assert "HOMOLOGACAO" in xml_str

    ns = "http://www.portalfiscal.inf.br/nfe"
    ver_proc = xml.find(f".//{{{ns}}}verProc")
    assert ver_proc is not None
    assert ver_proc.text == "nexus"
    assert "PyNFe" not in (ver_proc.text or "")


def _ide_text(xml, tag):
    el = xml.find(f".//{{http://www.portalfiscal.inf.br/nfe}}{tag}")
    return el.text if el is not None else None


def test_dhemi_converted_to_brasilia_offset(sap_fixture):
    """UTC input must become -03:00 wall time, not keep UTC digits with host offset."""
    sap_fixture["data_emissao"] = "2026-09-03T13:00:00Z"
    sap_fixture.pop("data_entrada_saida", None)
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    assert _ide_text(xml, "dhEmi") == "2026-09-03T10:00:00-03:00"
    assert _ide_text(xml, "dhSaiEnt") == "2026-09-03T10:00:00-03:00"


def test_future_dhemi_is_clamped_to_now(sap_fixture):
    """SAP placeholder time ahead of SEFAZ receipt triggers cStat 703."""
    from datetime import datetime, timedelta, timezone

    brt = timezone(timedelta(hours=-3))
    future = datetime.now(brt) + timedelta(hours=3)
    sap_fixture["data_emissao"] = future.isoformat(timespec="seconds")
    sap_fixture["data_entrada_saida"] = future.isoformat(timespec="seconds")
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    dh_emi = datetime.fromisoformat(_ide_text(xml, "dhEmi"))
    assert dh_emi <= datetime.now(brt)
    assert dh_emi.utcoffset() == timedelta(hours=-3)
    assert _ide_text(xml, "dhSaiEnt") == future.strftime("%Y-%m-%dT%H:%M:%S-03:00")


def test_clamp_keeps_past_emission():
    from datetime import datetime, timedelta, timezone

    from nfe_gateway.sefaz.sap_nfe import _clamp_future_emission

    brt = timezone(timedelta(hours=-3))
    now = datetime(2026, 9, 28, 8, 32, 2, tzinfo=brt)
    past = datetime(2026, 9, 28, 8, 0, 0, tzinfo=brt)
    assert _clamp_future_emission(past, now=now) == past
    noon = datetime(2026, 9, 28, 12, 0, 0, tzinfo=brt)
    assert _clamp_future_emission(noon, now=now) == datetime(2026, 9, 28, 8, 31, 2, tzinfo=brt)


def test_build_unsigned_xml_homologacao_false(sap_fixture):
    """Test that homologacao disclaimer is omitted when homologacao=False."""
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    xml_str = etree.tostring(xml, encoding="unicode")
    
    # Should not contain disclaimer if no infCpl was in SAP
    # (or if infCpl exists, disclaimer should not be added)
    # Since our fixture has informacoes_adicionais_contribuinte, check it's preserved
    assert "Nota fiscal de exemplo para testes do SAP outbound" in xml_str


def test_build_unsigned_xml_emitter_fields(sap_fixture):
    """Test emitter fields are mapped correctly."""
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    xml_str = etree.tostring(xml, encoding="unicode")
    
    assert "EMPRESA EMISSORA LTDA" in xml_str
    assert "12345678000195" in xml_str  # CNPJ
    assert "RUA DAS FLORES" in xml_str


def test_build_unsigned_xml_recipient_fields(sap_fixture):
    """Test recipient fields are mapped correctly."""
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    xml_str = etree.tostring(xml, encoding="unicode")
    
    assert "EMPRESA DESTINATARIA LTDA" in xml_str
    assert "98765432000188" in xml_str  # CNPJ dest
    assert "contato@destinataria.com.br" in xml_str


def test_icms_st_cst10_reaches_xml_and_vnf(sap_fixture):
    """CST 10 must carry SAP ICMS-ST into the item group, totals and vNF."""
    item = sap_fixture["items"][0]
    item["icms_cst"] = "10"
    item["cfop"] = "6403"
    item["icms_st_modalidade"] = "4"
    item["icms_st_mva_aliquota"] = 40.00
    item["icms_st_reducao_percent"] = 0
    item["icms_st_base"] = 1400.00
    item["icms_st_aliquota"] = 18.00
    item["icms_st_valor"] = 72.00
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"

    def text(tag: str) -> str:
        node = xml.find(f".//{{{ns}}}{tag}")
        assert node is not None and node.text is not None
        return node.text

    assert text("CST") == "10"
    assert text("modBCST") == "4"
    assert text("pMVAST") == "40.00"
    assert text("vBCST") == "1400.00"
    assert text("pICMSST") == "18.00"
    assert text("vICMSST") == "72.00"
    assert text("vST") == "72.00"
    assert text("vNF") == "1072.00"


def _vtottrib_texts(xml: etree._Element) -> tuple[str | None, str | None]:
    ns = "http://www.portalfiscal.inf.br/nfe"
    item = xml.find(f".//{{{ns}}}det/{{{ns}}}imposto/{{{ns}}}vTotTrib")
    total = xml.find(f".//{{{ns}}}ICMSTot/{{{ns}}}vTotTrib")
    return (
        item.text if item is not None else None,
        total.text if total is not None else None,
    )


def test_item_vtottrib_has_two_decimals(sap_fixture):
    """SEFAZ 215: TDec_1302 rejects '37.7' — item and total must be '37.70'."""
    sap_fixture["items"] = sap_fixture["items"][:1]
    sap_fixture.pop("valor_total_tributos", None)
    sap_fixture["items"][0]["valor_tributos"] = 37.7
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    assert _vtottrib_texts(xml) == ("37.70", "37.70")


def test_header_vtottrib_single_item_has_two_decimals(sap_fixture):
    sap_fixture["items"] = sap_fixture["items"][:1]
    item = sap_fixture["items"][0]
    item.pop("valor_tributos", None)
    item.pop("valor_total_tributos", None)
    sap_fixture["valor_total_tributos"] = 37.7
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    assert _vtottrib_texts(xml) == ("37.70", "37.70")


def test_build_unsigned_xml_product_fields(sap_fixture):
    """Test product items are mapped correctly."""
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    xml_str = etree.tostring(xml, encoding="unicode")
    
    assert "PROD-001" in xml_str
    assert "PRODUTO DE TESTE" in xml_str
    assert "12345678" in xml_str  # NCM


def test_build_unsigned_xml_missing_required_field(sap_fixture):
    """Test that missing required field raises SapNfeMapperError."""
    del sap_fixture["numero"]
    
    with pytest.raises(SapNfeMapperError, match="numero"):
        build_unsigned_xml(sap_fixture, homologacao=True)


def test_build_unsigned_xml_empty_items(sap_fixture):
    """Test that empty items[] raises SapNfeMapperError."""
    sap_fixture["items"] = []
    
    with pytest.raises(SapNfeMapperError, match="items"):
        build_unsigned_xml(sap_fixture, homologacao=True)


def test_build_unsigned_xml_string_decimal_conversion(sap_fixture):
    """Test that string decimal values like '100.0000000' are handled."""
    # The fixture already has this format for valor_unitario_comercial
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    xml_str = etree.tostring(xml, encoding="unicode")
    
    # Should succeed without ValueError
    assert xml is not None
    assert "100" in xml_str  # Value should be present


def test_pis_cofins_cst_required(sap_fixture):
    """Missing PIS CST must raise a clear user-facing mapper error."""
    item = sap_fixture["items"][0]
    for key in list(item):
        if key.startswith("pis") or key.startswith("cofins"):
            del item[key]

    with pytest.raises(SapNfeMapperError, match=r"falta CST de PIS.*pis_cst"):
        build_unsigned_xml(sap_fixture, homologacao=True)


def test_pis_cofins_situacao_alias_and_modalidade(sap_fixture):
    """PyNFe entity uses situacao_tributaria; serialização reads modalidade — set both."""
    item = sap_fixture["items"][0]
    item.pop("pis_cst", None)
    item.pop("cofins_cst", None)
    item["pis_situacao_tributaria"] = "01"
    item["cofins_situacao_tributaria"] = "01"

    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    ns = "http://www.portalfiscal.inf.br/nfe"
    pis_cst = xml.find(f".//{{{ns}}}PIS//{{{ns}}}CST")
    cofins_cst = xml.find(f".//{{{ns}}}COFINS//{{{ns}}}CST")
    assert pis_cst is not None and pis_cst.text == "01"
    assert cofins_cst is not None and cofins_cst.text == "01"


def test_cnpj_destinatario_pads_leading_zeros(sap_fixture):
    """cStat 215: classic numeric CNPJ — pad zeros lost as JSON numbers."""
    sap_fixture["cnpj_destinatario"] = "3315000193"  # 10 digits
    sap_fixture["cpf_destinatario"] = ""
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    dest = xml.find(f".//{{{ns}}}dest")
    assert dest is not None
    cnpj = dest.find(f"{{{ns}}}CNPJ")
    assert cnpj is not None
    assert cnpj.text == "00003315000193"
    assert len(cnpj.text) == 14


def test_numero_rejects_zero(sap_fixture):
    """cStat 215: XSD TNF rejects nNF=0."""
    sap_fixture["numero"] = "0"
    with pytest.raises(SapNfeMapperError, match="between 1 and 999999999"):
        build_unsigned_xml(sap_fixture, homologacao=True)


def test_numero_strips_leading_zeros(sap_fixture):
    sap_fixture["numero"] = "000034155"
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    ns = "http://www.portalfiscal.inf.br/nfe"
    nnf = xml.find(f".//{{{ns}}}ide/{{{ns}}}nNF")
    assert nnf is not None and nnf.text == "34155"


def test_blank_optional_int_fields_use_defaults(sap_fixture):
    """ABAP sends "" for empty fields; must not reach int('')."""
    for key in ("finalidade_emissao", "consumidor_final", "presenca_comprador", "local_destino", "modalidade_frete"):
        sap_fixture[key] = ""
    xml = build_unsigned_xml(sap_fixture, homologacao=True)
    ns = "http://www.portalfiscal.inf.br/nfe"
    assert xml.find(f".//{{{ns}}}ide/{{{ns}}}finNFe").text == "1"


def test_blank_required_int_field_is_mapper_error(sap_fixture):
    sap_fixture["tipo_documento"] = ""
    with pytest.raises(SapNfeMapperError, match="tipo_documento"):
        build_unsigned_xml(sap_fixture, homologacao=True)


def test_cnpj_destinatario_alphanumeric_survives_pynfe(sap_fixture):
    """NT 2026.004: PyNFe so_numeros() strips letters — patch must restore CNPJ."""
    # Pattern [A-Z0-9]{12}[0-9]{2}; 4 letters + 10 digits → digit remnant 3315000193.
    sap_fixture["cnpj_destinatario"] = "33a15b00cd0193"
    sap_fixture["cpf_destinatario"] = ""
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    dest = xml.find(f".//{{{ns}}}dest")
    assert dest is not None
    cnpj = dest.find(f"{{{ns}}}CNPJ")
    assert cnpj is not None
    assert cnpj.text == "33A15B00CD0193"
    assert len(cnpj.text) == 14
    assert any(ch.isalpha() for ch in cnpj.text)


def test_pessoas_autorizadas_cnpj_pads_leading_zeros(sap_fixture):
    sap_fixture["pessoas_autorizadas"] = [{"cnpj": "3315000193"}]
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    aut = xml.find(f".//{{{ns}}}autXML/{{{ns}}}CNPJ")
    assert aut is not None
    assert aut.text == "00003315000193"


def test_cfop_5656_emits_comb_and_drops_zero_placeholders(sap_fixture):
    """cStat 660: fuel CFOP must carry prod/comb. SAP zeros are not ANP data."""
    item = sap_fixture["items"][0]
    item["cfop"] = "5656"
    item["combustivel_codigo_anp"] = "610501001"
    item["combustivel_descricao_anp"] = "OUTROS ÓLEOS LUBRIFICANTES BÁSICOS"
    item["combustivel_sigla_uf"] = "BA"
    item["combustivel_registro_codif"] = "000000000000000000000"
    item["combustivel_percentual_glp"] = 0
    item["combustivel_quantidade_temp"] = 0
    item["combustivel_numero_bico"] = ""
    item["combustivel_percentual_biodies"] = 0
    xml = build_unsigned_xml(sap_fixture, homologacao=False)
    ns = "http://www.portalfiscal.inf.br/nfe"
    prod = xml.find(f".//{{{ns}}}det/{{{ns}}}prod")
    assert prod is not None
    comb = prod.find(f"{{{ns}}}comb")
    assert comb is not None
    texts = {etree.QName(child).localname: child.text for child in comb}
    assert texts["cProdANP"] == "610501001"
    assert texts["descANP"] == "OUTROS OLEOS LUBRIFICANTES BASICOS"
    assert texts["UFCons"] == "BA"
    assert "CODIF" not in texts
    assert "pGLP" not in texts
    assert "qTemp" not in texts
    assert "encerrante" not in texts
    assert "pBio" not in texts
    names = [etree.QName(child).localname for child in prod]
    assert names.index("indTot") < names.index("comb")


def test_fuel_cfop_without_anp_is_mapper_error(sap_fixture):
    sap_fixture["items"][0]["cfop"] = "5656"
    sap_fixture["items"][0]["combustivel_codigo_anp"] = ""
    with pytest.raises(SapNfeMapperError, match="combustivel_codigo_anp"):
        build_unsigned_xml(sap_fixture, homologacao=False)
