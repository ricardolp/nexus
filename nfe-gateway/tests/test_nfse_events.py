"""Tests for NFS-e Nacional cancel event builder and SEFIN post_evento."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from lxml import etree

from nfe_gateway.nfse.dps import NS, build_unsigned_dps
from nfe_gateway.nfse.events import (
    build_cancel_ped_reg_evento,
    build_cancel_pedido_id,
    ped_reg_xml_bytes,
)
from nfe_gateway.nfse.sefin import gzip_b64, gunzip_b64, post_evento

# Synthetic 50-char access key (digits only) for unit tests.
CHAVE = "35503081234567800019500000000000000000000000000001"
CNPJ = "12345678000195"


def test_build_cancel_pedido_id():
    ped_id = build_cancel_pedido_id(chave=CHAVE)
    assert ped_id == f"PRE{CHAVE}101101"
    assert len(ped_id) == 59


def test_build_cancel_ped_reg_evento():
    root = build_cancel_ped_reg_evento(
        chave=CHAVE,
        cnpj=CNPJ,
        c_motivo="1",
        x_motivo="Erro na emissao da nota de servico",
        homologacao=True,
    )
    xml = ped_reg_xml_bytes(root).decode("utf-8")
    assert "pedRegEvento" in xml
    assert 'versao="1.01"' in xml
    assert f'Id="PRE{CHAVE}101101"' in xml
    assert f"<chNFSe>{CHAVE}</chNFSe>" in xml
    assert "<e101101>" in xml
    assert "<cMotivo>1</cMotivo>" in xml
    assert "Cancelamento de NFS-e" in xml
    assert "<tpAmb>2</tpAmb>" in xml

    inf = root.find(f"{{{NS}}}infPedReg")
    assert inf is not None
    names = [etree.QName(c).localname for c in inf]
    assert names == ["tpAmb", "verAplic", "dhEvento", "CNPJAutor", "chNFSe", "e101101"]


def test_build_cancel_rejects_short_motivo():
    with pytest.raises(ValueError, match="15 characters"):
        build_cancel_ped_reg_evento(
            chave=CHAVE,
            cnpj=CNPJ,
            c_motivo="1",
            x_motivo="curto",
            homologacao=True,
        )


def test_build_cancel_rejects_bad_c_motivo():
    with pytest.raises(ValueError, match="c_motivo"):
        build_cancel_ped_reg_evento(
            chave=CHAVE,
            cnpj=CNPJ,
            c_motivo="3",
            x_motivo="Justificativa com tamanho suficiente",
            homologacao=True,
        )


def test_post_evento_success(monkeypatch):
    signed = b"<pedRegEvento/>"
    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.content = b"{}"
    mock_resp.json.return_value = {
        "eventoXmlGZipB64": gzip_b64(b"<evento><infEvento Id='EVT1'/></evento>"),
        "idEvento": "EVT1",
    }
    mock_session = MagicMock()
    mock_session.post.return_value = mock_resp

    monkeypatch.setattr(
        "nfe_gateway.nfse.sefin._materialize_mtls_files",
        lambda pfx: (__import__("pathlib").Path("."), __import__("pathlib").Path(".")),
    )
    monkeypatch.setattr("nfe_gateway.nfse.sefin._shred", lambda path: None)

    result = post_evento(
        chave=CHAVE,
        signed_xml=signed,
        pfx=b"fake",
        homologacao=True,
        session=mock_session,
    )
    assert result["outcome"] == "accepted"
    assert result["event_kind"] == "cancel"
    assert result["cstat"] == "135"
    call_kwargs = mock_session.post.call_args
    assert f"/nfse/{CHAVE}/eventos" in call_kwargs.args[0]
    body = __import__("json").loads(call_kwargs.kwargs["data"])
    assert "pedidoRegistroEventoXmlGZipB64" in body
    assert gunzip_b64(body["pedidoRegistroEventoXmlGZipB64"]) == signed


def test_post_evento_rejected(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.reason = "Bad Request"
    mock_resp.content = b"{}"
    mock_resp.json.return_value = {
        "erros": [{"codigo": "E0078", "descricao": "xMotivo invalido"}],
    }
    mock_session = MagicMock()
    mock_session.post.return_value = mock_resp
    monkeypatch.setattr(
        "nfe_gateway.nfse.sefin._materialize_mtls_files",
        lambda pfx: (__import__("pathlib").Path("."), __import__("pathlib").Path(".")),
    )
    monkeypatch.setattr("nfe_gateway.nfse.sefin._shred", lambda path: None)

    result = post_evento(
        chave=CHAVE,
        signed_xml=b"<x/>",
        pfx=b"fake",
        homologacao=True,
        session=mock_session,
    )
    assert result["outcome"] == "rejected"
    assert result["event_kind"] == "cancel"
    assert "E0078" in result["cstat"] or "E0078" in result["error_code"]


def test_dps_subst_group():
    payload = {
        "serie_rps": "1",
        "numero_rps": "100",
        "data_emissao": "2026-03-20T10:00:00-03:00",
        "optante_simples_nacional": True,
        "chave_nfse_substituida": CHAVE,
        "motivo_substituicao": "99",
        "justificativa_substituicao": "Correcao de valor do servico prestado",
        "prestador": {"cnpj": CNPJ, "codigo_municipio": "3550308", "inscricao_municipal": "123"},
        "tomador": {
            "cnpj": "11222333000181",
            "razao_social": "Cliente",
            "endereco": {
                "logradouro": "Rua A",
                "numero": "1",
                "bairro": "Centro",
                "codigo_municipio": "3550308",
                "uf": "SP",
                "cep": "01001000",
            },
        },
        "servico": {
            "valor_servicos": 100.0,
            "item_lista_servico": "17.09",
            "discriminacao": "Servico de teste",
            "codigo_municipio": "3550308",
            "codigo_nbs": "1.1501.10.00",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "percentual_total_tributos": 9.41,
        },
    }
    root = build_unsigned_dps(payload, homologacao=True)
    subst = root.find(f"{{{NS}}}infDPS/{{{NS}}}subst")
    assert subst is not None
    assert subst.findtext(f"{{{NS}}}chSubstda") == CHAVE
    assert subst.findtext(f"{{{NS}}}cMotivo") == "99"
    assert "Correcao" in (subst.findtext(f"{{{NS}}}xMotivo") or "")
