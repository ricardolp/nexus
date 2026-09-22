"""Tests for exact-string SOAP wrapping and text/namespace sanitization."""

from __future__ import annotations

from lxml import etree

from nfe_gateway.sefaz.assinatura import normalize_nfe_namespaces
from nfe_gateway.sefaz.autorizacao_soap import build_nfe_autorizacao_soap
from nfe_gateway.sefaz.xml_patches import remove_empty_elements, sanitize_for_signature


def test_autorizacao_soap_embeds_signed_nfe_verbatim():
    signed = (
        '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'
        '<infNFe Id="NFeABC"><ide><cUF>42</cUF></ide></infNFe>'
        "<Signature>KEEP_ME_EXACT</Signature></NFe>"
    )
    soap = build_nfe_autorizacao_soap(signed, id_lote=7, ind_sinc=1)
    assert soap.startswith("<?xml")
    assert "KEEP_ME_EXACT" in soap
    assert "<idLote>7</idLote>" in soap
    assert "<indSinc>1</indSinc>" in soap
    assert soap.count("<NFe") == 1


def test_normalize_removes_nfe_ns0_prefixes_without_xmlns_redefined():
    raw = (
        '<NFe xmlns:ns0="http://www.portalfiscal.inf.br/nfe">'
        '<ns0:infNFe Id="NFe1">'
        "<ns0:pag><ns0:detPag><ns0:tPag>90</ns0:tPag>"
        "<ns0:vPag>0.00</ns0:vPag></ns0:detPag></ns0:pag>"
        "</ns0:infNFe></NFe>"
    )
    root = normalize_nfe_namespaces(etree.fromstring(raw))
    out = etree.tostring(root, encoding="unicode")
    # Must parse cleanly (no xmlns redefined) and have no ns0: on schema tags.
    etree.fromstring(out)
    assert "ns0:" not in out
    assert "detPag" in out
    assert out.count("xmlns=") == 1


def test_normalize_preserves_id_and_detpag():
    nfe_ns = "http://www.portalfiscal.inf.br/nfe"
    raw = (
        f'<NFe xmlns="{nfe_ns}">'
        '<infNFe Id="NFe4226">'
        "<pag><detPag><tPag>90</tPag><vPag>0.00</vPag></detPag></pag>"
        "</infNFe></NFe>"
    )
    root = normalize_nfe_namespaces(etree.fromstring(raw))
    inf = next(e for e in root.iter() if etree.QName(e).localname == "infNFe")
    assert inf.get("Id") == "NFe4226"
    assert any(etree.QName(e).localname == "detPag" for e in root.iter())


def test_sanitize_strips_accents_and_specials():
    root = etree.fromstring(
        b"<root><xNome>  LS Mtron Ind\xc3\xbastria  </xNome>"
        b"<inf>linha1\nlinha2 \xc2\xba</inf><empty></empty></root>"
    )
    sanitize_for_signature(root)
    remove_empty_elements(root)
    assert root.find("xNome").text == "LS Mtron Industria"
    assert "linha1 linha2" in (root.find("inf").text or "")
    assert root.find("empty") is None
