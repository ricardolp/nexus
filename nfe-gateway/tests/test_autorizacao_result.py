"""Unit tests for lote 104 vs infProt cStat parsing."""

from __future__ import annotations

from lxml import etree

from nfe_gateway.sefaz.autorizacao_result import parse_autorizacao_or_recibo_xml


def test_lote_104_uses_infprot_rejection():
    xml = b"""<?xml version="1.0"?>
    <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      <tpAmb>2</tpAmb>
      <cStat>104</cStat>
      <xMotivo>Lote processado</xMotivo>
      <protNFe versao="4.00">
        <infProt>
          <chNFe>42260913677964000200550020000693421141507122</chNFe>
          <nProt>142260000000001</nProt>
          <cStat>302</cStat>
          <xMotivo>Uso Denegado: Irregularidade fiscal do destinatario</xMotivo>
        </infProt>
      </protNFe>
    </retEnviNFe>
    """
    parsed = parse_autorizacao_or_recibo_xml(etree.fromstring(xml))
    assert parsed.outcome == "rejected"
    assert parsed.lote_cstat == "104"
    assert parsed.cstat == "302"
    assert "Denegado" in parsed.x_motivo
    assert parsed.access_key == "42260913677964000200550020000693421141507122"
    assert parsed.protocol == "142260000000001"


def test_lote_104_uses_infprot_authorized():
    xml = b"""<?xml version="1.0"?>
    <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      <cStat>104</cStat>
      <xMotivo>Lote processado</xMotivo>
      <protNFe>
        <infProt>
          <chNFe>35260912345678000195550010000123451234567890</chNFe>
          <nProt>123456789012345</nProt>
          <cStat>100</cStat>
          <xMotivo>Autorizado o uso da NF-e</xMotivo>
        </infProt>
      </protNFe>
    </retEnviNFe>
    """
    parsed = parse_autorizacao_or_recibo_xml(etree.fromstring(xml))
    assert parsed.outcome == "authorized"
    assert parsed.cstat == "100"
    assert parsed.lote_cstat == "104"


def test_lote_103_poll():
    xml = b"""<?xml version="1.0"?>
    <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <cStat>103</cStat>
      <xMotivo>Lote recebido com sucesso</xMotivo>
      <infRec><nRec>123456789012345</nRec></infRec>
    </retEnviNFe>
    """
    parsed = parse_autorizacao_or_recibo_xml(etree.fromstring(xml))
    assert parsed.outcome == "poll_recibo"
    assert parsed.recibo == "123456789012345"


def test_recibo_105_processing():
    xml = b"""<?xml version="1.0"?>
    <retConsReciNFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <cStat>105</cStat>
      <xMotivo>Lote em processamento</xMotivo>
    </retConsReciNFe>
    """
    parsed = parse_autorizacao_or_recibo_xml(etree.fromstring(xml))
    assert parsed.outcome == "processing"


def test_parse_consulta_situacao_authorized():
    from nfe_gateway.sefaz.autorizacao_result import parse_consulta_situacao_xml

    xml = b"""<?xml version="1.0"?>
    <retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      <tpAmb>2</tpAmb>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
      <chNFe>42260913677964000200550020000693421415071225</chNFe>
      <protNFe versao="4.00">
        <infProt>
          <chNFe>42260913677964000200550020000693421415071225</chNFe>
          <nProt>142260000000999</nProt>
          <cStat>100</cStat>
          <xMotivo>Autorizado o uso da NF-e</xMotivo>
        </infProt>
      </protNFe>
    </retConsSitNFe>
    """
    parsed = parse_consulta_situacao_xml(etree.fromstring(xml))
    assert parsed.outcome == "authorized"
    assert parsed.cstat == "100"
    assert parsed.protocol == "142260000000999"
    assert parsed.access_key == "42260913677964000200550020000693421415071225"
    assert parsed.prot_nfe is not None


def test_extract_access_key_from_nfe_id():
    from nfe_gateway.sefaz.autorizacao_result import extract_access_key_from_nfe

    chave = "42260913677964000200550020000693421415071225"
    nota = etree.fromstring(
        f'<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'
        f'<infNFe Id="NFe{chave}"><ide/></infNFe></NFe>'.encode()
    )
    assert extract_access_key_from_nfe(nota) == chave
