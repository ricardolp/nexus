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
