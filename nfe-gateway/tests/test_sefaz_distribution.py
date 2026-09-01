import base64
import gzip

import pytest

from decimal import Decimal

from nfe_gateway.sefaz.distribution import (
    SefazResponseError,
    classify_cstat,
    parse_distribution_response,
    parse_pending_summary,
)
from nfe_gateway.distribution_state import PollOutcome


def _doc_zip(nsu: str, schema: str, inner_xml: bytes) -> str:
    return base64.b64encode(gzip.compress(inner_xml)).decode("ascii")


def _soap_response(cstat: str, ult_nsu: str, max_nsu: str, doc_zips: str = "") -> bytes:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDistDFeInteresseResult>
        <retDistDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
          <tpAmb>2</tpAmb>
          <verAplic>SVRS202601</verAplic>
          <cStat>{cstat}</cStat>
          <xMotivo>Consulta realizada com sucesso</xMotivo>
          <dhResp>2026-08-16T18:00:00-03:00</dhResp>
          <ultNSU>{ult_nsu}</ultNSU>
          <maxNSU>{max_nsu}</maxNSU>
          {f'<loteDistDFeInt>{doc_zips}</loteDistDFeInt>' if doc_zips else ''}
        </retDistDFeInt>
      </nfeDistDFeInteresseResult>
    </nfeDistDFeInteresseResponse>
  </soap:Body>
</soap:Envelope>""".encode("utf-8")


def test_parses_no_content_response():
    xml = _soap_response(cstat="137", ult_nsu="000000000000042", max_nsu="000000000000042")
    result = parse_distribution_response(xml)
    assert result.cstat == "137"
    assert result.ult_nsu == 42
    assert result.max_nsu == 42
    assert result.documents == []
    assert classify_cstat(result.cstat) is PollOutcome.NO_CONTENT


def test_parses_lote_with_documents_and_sorts_by_nsu():
    doc1_xml = b"<resNFe xmlns='http://www.portalfiscal.inf.br/nfe'><chNFe>1</chNFe></resNFe>"
    doc2_xml = b"<resNFe xmlns='http://www.portalfiscal.inf.br/nfe'><chNFe>2</chNFe></resNFe>"
    zip1 = _doc_zip("2", "resNFe_v1.01.xsd", doc2_xml)
    zip2 = _doc_zip("1", "resNFe_v1.01.xsd", doc1_xml)
    doc_zips = (
        f'<docZip NSU="000000000000002" schema="resNFe_v1.01.xsd">{zip1}</docZip>'
        f'<docZip NSU="000000000000001" schema="resNFe_v1.01.xsd">{zip2}</docZip>'
    )
    xml = _soap_response(cstat="138", ult_nsu="000000000000002", max_nsu="000000000000010", doc_zips=doc_zips)

    result = parse_distribution_response(xml)

    assert result.cstat == "138"
    assert classify_cstat(result.cstat) is PollOutcome.HAS_MORE
    assert [d.nsu for d in result.documents] == [1, 2]
    assert result.documents[0].xml_bytes == doc1_xml
    assert result.documents[1].xml_bytes == doc2_xml
    assert result.documents[0].schema == "resNFe_v1.01.xsd"


def test_rate_limited_cstat_has_no_documents():
    xml = _soap_response(cstat="656", ult_nsu="000000000000005", max_nsu="000000000000005")
    result = parse_distribution_response(xml)
    assert classify_cstat(result.cstat) is PollOutcome.RATE_LIMITED


def test_soap_fault_raises_sefaz_response_error():
    xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <soap:Fault>
      <soap:Code><soap:Value>soap:Sender</soap:Value></soap:Code>
      <soap:Reason><soap:Text>Certificado invalido</soap:Text></soap:Reason>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>"""
    with pytest.raises(SefazResponseError, match="Certificado invalido"):
        parse_distribution_response(xml)


def test_garbage_response_raises_sefaz_response_error():
    with pytest.raises(SefazResponseError):
        parse_distribution_response(b"not xml at all")


# Real resNFe payload pulled live from hom1.nfe.fazenda.gov.br (2026-08-17,
# LS Mtron NSU=0 resync) — exact bytes, not synthesized, so the parser is
# tested against what SEFAZ actually sends, not a guessed shape.
_REAL_RESNFE_XML = (
    b'<resNFe xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
    b'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" versao="1.01" '
    b'xmlns="http://www.portalfiscal.inf.br/nfe">'
    b"<chNFe>42260882927385000100550010001357061196660238</chNFe>"
    b"<CNPJ>82927385000100</CNPJ>"
    b"<xNome>BATERIAS PIONEIRO INDUSTRIAL LTDA MTZ 0001-00</xNome>"
    b"<IE>252184866</IE>"
    b"<dhEmi>2026-08-07T14:07:16-03:00</dhEmi>"
    b"<tpNF>1</tpNF>"
    b"<vNF>37869.30</vNF>"
    b"<digVal>MdRd1uDANHi7RJ5o2XsFNsMUPwo=</digVal>"
    b"<dhRecbto>2026-08-07T14:07:18-03:00</dhRecbto>"
    b"<nProt>342260000804982</nProt>"
    b"<cSitNFe>1</cSitNFe>"
    b"</resNFe>"
)


def test_parse_pending_summary_extracts_real_resnfe_fields():
    summary = parse_pending_summary(_REAL_RESNFE_XML)
    assert summary is not None
    assert summary.chave == "42260882927385000100550010001357061196660238"
    assert summary.cnpj_emitente == "82927385000100"
    assert summary.nome_emitente == "BATERIAS PIONEIRO INDUSTRIAL LTDA MTZ 0001-00"
    assert summary.valor == Decimal("37869.30")
    assert summary.protocolo == "342260000804982"
    assert summary.situacao == "1"
    assert summary.data_emissao is not None
    assert summary.data_emissao.year == 2026 and summary.data_emissao.month == 8


def test_parse_pending_summary_returns_none_without_chave():
    assert parse_pending_summary(b"<resEvento><CNPJ>82927385000100</CNPJ></resEvento>") is None


def test_parse_pending_summary_returns_none_on_garbage():
    assert parse_pending_summary(b"not xml at all") is None
