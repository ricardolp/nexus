from datetime import datetime, timedelta

import pytest

from nfe_gateway.sefaz.manifestation import (
    ManifestationResponseError,
    build_ciencia_evento,
    parse_evento_response,
)


def test_build_ciencia_evento_matches_nt2020_shape():
    el = build_ciencia_evento(
        chave="42260882927385000100550010001357061196660238",
        cnpj="19347197000159",
        homologacao=True,
    )
    # PyNFe's serializar_evento sets xmlns as a literal attribute (not via
    # lxml's nsmap), which serializes to correct wire XML but leaves the
    # in-memory tags un-namespaced — same reason distribution.py matches by
    # local name (etree.QName(...).localname) instead of namespace-aware
    # xpath. Bare tag lookups here are consistent with how the rest of the
    # codebase actually queries PyNFe-built/parsed trees.
    assert el.tag == "evento"
    assert el.find(".//tpEvento").text == "210210"
    assert el.find(".//nSeqEvento").text == "1"
    assert el.find(".//CNPJ").text == "19347197000159"
    assert el.find(".//chNFe").text == "42260882927385000100550010001357061196660238"
    assert el.find(".//descEvento").text == "Ciencia da Operacao"
    assert el.find(".//tpAmb").text == "2"  # homologacao
    # Regression test for a real rejection hit live 2026-08-17: cOrgao must
    # always be 91 (Ambiente Nacional), never the company's own UF — see
    # build_ciencia_evento's docstring.
    assert el.find(".//cOrgao").text == "91"
    inf_evento = el.find(".//infEvento")
    assert inf_evento.attrib["Id"] == (
        "ID2102104226088292738500010055001000135706119666023801"
    )


def test_build_ciencia_evento_dhevento_is_local_now_not_future():
    # Regression for cStat 578 "A data do evento nao pode ser maior que a
    # data do processamento", hit live 2026-08-17: PyNFe's serializar_evento
    # takes data_emissao's raw digits (no tz conversion) and separately
    # appends the LOCAL system offset — passing a UTC-aware datetime meant
    # the digits (UTC) got labeled with the local (-03:00-style) offset,
    # silently declaring an instant hours ahead of real now. Asserts the
    # parsed dhEvento resolves to within a few seconds of true now, not
    # hours off, which is what actually caught the bug (a naive "is it a
    # non-empty string" check would have passed the broken version too).
    before = datetime.now().astimezone()
    el = build_ciencia_evento(
        chave="42260882927385000100550010001357061196660238", cnpj="19347197000159", homologacao=True
    )
    after = datetime.now().astimezone()
    dh_evento = datetime.fromisoformat(el.find(".//dhEvento").text)
    assert before - timedelta(seconds=5) <= dh_evento <= after + timedelta(seconds=5)


def test_build_ciencia_evento_producao_tpamb():
    el = build_ciencia_evento(
        chave="42260882927385000100550010001357061196660238", cnpj="19347197000159", homologacao=False
    )
    assert el.find(".//tpAmb").text == "1"


# Synthetic response shaped per NT 2020.001's documented retEnvEvento/
# retEvento envelope — not captured live (submitting a real Ciência event
# needs an explicit, separately-confirmed SEFAZ call, unlike the read-only
# distribution query this session already exercised against homologação).
def _evento_soap_response(lote_cstat: str, evento_cstat: str | None = None, nprot: str | None = None) -> bytes:
    ret_evento = (
        f"""<retEvento versao="1.00">
              <infEvento>
                <cStat>{evento_cstat}</cStat>
                <xMotivo>ok</xMotivo>
                {f'<nProt>{nprot}</nProt>' if nprot else ''}
              </infEvento>
            </retEvento>"""
        if evento_cstat
        else ""
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <nfeRecepcaoEvento4Result xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <retEnvEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <idLote>1</idLote>
        <tpAmb>2</tpAmb>
        <verAplic>SVRS202601</verAplic>
        <cStat>{lote_cstat}</cStat>
        <xMotivo>Lote de Evento Processado</xMotivo>
        {ret_evento}
      </retEnvEvento>
    </nfeRecepcaoEvento4Result>
  </soap:Body>
</soap:Envelope>""".encode("utf-8")


def test_parse_evento_response_success():
    xml = _evento_soap_response(lote_cstat="128", evento_cstat="135", nprot="142260000123456")
    result = parse_evento_response(xml)
    assert result.lote_cstat == "128"
    assert result.evento_cstat == "135"
    assert result.protocolo == "142260000123456"
    assert result.accepted is True


def test_parse_evento_response_duplicate_is_accepted():
    xml = _evento_soap_response(lote_cstat="128", evento_cstat="573")
    result = parse_evento_response(xml)
    assert result.accepted is True


def test_parse_evento_response_rejection_not_accepted():
    xml = _evento_soap_response(lote_cstat="128", evento_cstat="252")  # arbitrary rejection code
    result = parse_evento_response(xml)
    assert result.accepted is False


def test_parse_evento_response_lote_only_no_evento_not_accepted():
    xml = _evento_soap_response(lote_cstat="215")  # lote-level rejection, no retEvento at all
    result = parse_evento_response(xml)
    assert result.evento_cstat is None
    assert result.accepted is False


def test_garbage_response_raises_manifestation_response_error():
    with pytest.raises(ManifestationResponseError):
        parse_evento_response(b"not xml at all")
