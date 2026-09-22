"""Tests for cancel / CC-e event XML builders."""

from __future__ import annotations

from lxml import etree

from nfe_gateway.sefaz.events import build_cancel_evento, build_cce_evento


def test_build_cancel_evento():
    xml = build_cancel_evento(
        chave="35240912345678000195550010000000011000000010",
        protocolo="135240000000001",
        cnpj="12345678000195",
        justificativa="Cancelamento por erro de emissao na NF-e",
        homologacao=True,
    )
    s = etree.tostring(xml, encoding="unicode")
    assert "110111" in s
    assert "Cancelamento" in s
    assert "135240000000001" in s


def test_build_cce_evento():
    xml = build_cce_evento(
        chave="35240912345678000195550010000000011000000010",
        cnpj="12345678000195",
        correcao="Correcao do endereco do destinatario conforme solicitado",
        homologacao=True,
        n_seq=2,
    )
    s = etree.tostring(xml, encoding="unicode")
    assert "110110" in s
    assert "Carta de Correcao" in s
    assert "ID110110" in s
