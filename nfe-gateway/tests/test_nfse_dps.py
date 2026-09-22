"""Tests for SAP NFS-e → DPS mapper and SEFIN client helpers."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from lxml import etree

from nfe_gateway.nfse.dps import (
    NS,
    SapNfseMapperError,
    build_unsigned_dps,
    dps_xml_bytes,
    generate_dps_id,
)
from nfe_gateway.nfse.sefin import gzip_b64, gunzip_b64, post_dps, sefin_base_url


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sap_nfse_outbound.json"


@pytest.fixture
def sap_fixture():
    with FIXTURE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def test_generate_dps_id_length():
    dps_id = generate_dps_id(cnpj="12345678000123", municipio="3550308", serie="1", numero="1001")
    assert dps_id.startswith("DPS")
    assert len(dps_id) == 3 + 7 + 1 + 14 + 5 + 15


def test_build_unsigned_dps_success(sap_fixture):
    root = build_unsigned_dps(sap_fixture, homologacao=True)
    xml = dps_xml_bytes(root).decode("utf-8")
    assert "infDPS" in xml
    assert 'versao="1.01"' in xml
    assert "tpAmb>2<" in xml or ">2</" in xml
    assert "12345678000123" in xml
    assert "170901" in xml or "17.09" in xml
    assert "Serviços de desenvolvimento" in xml
    assert "1500.00" in xml
    assert "<regTrib>" in xml
    assert "<opSimpNac>3</opSimpNac>" in xml  # fixture optante_simples_nacional=true
    assert "<regEspTrib>6</regEspTrib>" in xml or "<regEspTrib>0</regEspTrib>" in xml
    assert "<endNac>" in xml
    assert "<cNBS>115011000</cNBS>" in xml  # 1.1501.10.00 → digits-only
    assert "<regApTribSN>1</regApTribSN>" in xml
    assert "cCNAE" not in xml
    assert "cTribMun" not in xml  # fixture municipal code is 4 digits; XSD wants 3
    # Fixture provides explicit IBS CST/cClassTrib → group is emitted.
    assert "<IBSCBS>" in xml
    assert "<CST>000</CST>" in xml
    assert "<cClassTrib>000001</cClassTrib>" in xml
    assert "<cIndOp>020101</cIndOp>" in xml
    assert "<pTotTribSN>34.00</pTotTribSN>" in xml  # 0.34 → percent display
    assert "<piscofins>" in xml
    assert "<vPis>10.50</vPis>" in xml
    assert "<vCofins>5.75</vCofins>" in xml

    toma = root.find(f"{{{NS}}}infDPS/{{{NS}}}toma")
    assert toma is not None
    assert [etree.QName(child).localname for child in toma] == [
        "CNPJ",
        "IM",
        "xNome",
        "end",
        "fone",
        "email",
    ]
    cserv = root.find(f"{{{NS}}}infDPS/{{{NS}}}serv/{{{NS}}}cServ")
    assert cserv is not None
    assert [etree.QName(child).localname for child in cserv] == ["cTribNac", "xDescServ", "cNBS"]
    ibs = root.find(f"{{{NS}}}infDPS/{{{NS}}}IBSCBS")
    assert ibs is not None
    assert [etree.QName(child).localname for child in ibs] == [
        "finNFSe",
        "indFinal",
        "cIndOp",
        "indDest",
        "valores",
    ]


def test_build_unsigned_dps_omits_ibscbs_without_classification():
    """ME/EPP without IBS classification: no IBSCBS; no forced vPis/vCofins."""
    payload = {
        "data_emissao": "2026-09-01T22:33:33-03:00",
        "natureza_operacao": "1",
        "serie_rps": "11111",
        "numero_rps": "100000000000072",
        "op_simp_nac": "3",
        "regime_apuracao_sn": "1",
        "regime_especial_tributacao": "0",
        "prestador": {
            "cnpj": "48401820000111",
            "codigo_municipio": "4106902",
        },
        "tomador": {
            "cnpj": "11372452000110",
            "razao_social": "SUM RESELLER S/A",
            "telefone": "1130418001",
            "endereco": {
                "logradouro": "Calcada das Margaridas",
                "numero": "163",
                "complemento": "Sala 2",
                "bairro": "Alphaville",
                "codigo_municipio": "3505708",
                "cep": "06453038",
            },
        },
        "servico": {
            "valor_servicos": 18480,
            "iss_retido": False,
            "item_lista_servico": "01.06.01",
            "codigo_nbs": "1.1501.10.00",
            "discriminacao": "nf ref a servicos prestados 08-2026",
            "codigo_municipio": "4106902",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "percentual_total_tributos": 9.41,
        },
    }
    root = build_unsigned_dps(payload, homologacao=False)
    xml = dps_xml_bytes(root).decode("utf-8")
    assert "<IBSCBS>" not in xml
    assert "<cClassTrib>" not in xml
    assert "<opSimpNac>3</opSimpNac>" in xml
    assert "<regApTribSN>1</regApTribSN>" in xml
    assert "<piscofins>" in xml
    assert "<CST>00</CST>" in xml
    assert "<vPis>" not in xml
    assert "<vCofins>" not in xml
    assert "<pTotTribSN>9.41</pTotTribSN>" in xml
    assert root.find(f"{{{NS}}}infDPS/{{{NS}}}IBSCBS") is None


def test_build_unsigned_dps_me_epp_requires_percentual():
    payload = {
        "data_emissao": "2026-09-01T22:33:33-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "1",
        "op_simp_nac": "3",
        "regime_especial_tributacao": "0",
        "prestador": {"cnpj": "48401820000111", "codigo_municipio": "4106902"},
        "tomador": {"cnpj": "11372452000110", "razao_social": "TOMADOR"},
        "servico": {
            "valor_servicos": 100,
            "iss_retido": False,
            "item_lista_servico": "01.06.01",
            "discriminacao": "servico",
            "codigo_municipio": "4106902",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
        },
    }
    with pytest.raises(SapNfseMapperError, match="pTotTribSN"):
        build_unsigned_dps(payload, homologacao=True)


def test_build_unsigned_dps_mei_ind_tot_trib():
    payload = {
        "data_emissao": "2026-09-06T21:16:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "2",
        "op_simp_nac": "2",
        "regime_especial_tributacao": "0",
        "prestador": {"cnpj": "48401820000111", "codigo_municipio": "4106902"},
        "tomador": {"cnpj": "11372452000110", "razao_social": "TOMADOR"},
        "servico": {
            "valor_servicos": 100,
            "iss_retido": False,
            "item_lista_servico": "01.06.01",
            "discriminacao": "servico",
            "codigo_municipio": "4106902",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert "<opSimpNac>2</opSimpNac>" in xml
    assert "<indTotTrib>0</indTotTrib>" in xml
    assert "<pTotTribSN>" not in xml
    assert "<vTotTrib>" not in xml
    assert "<vPis>" not in xml


def test_build_unsigned_dps_ibscbs_when_classification_provided():
    payload = {
        "data_emissao": "2026-09-06T21:16:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "5",
        "op_simp_nac": "1",
        "regime_especial_tributacao": "0",
        "finalidade_emissao": "0",
        "consumidor_final": "0",
        "indicador_destinatario": "0",
        "prestador": {
            "cnpj": "13677964000200",
            "codigo_municipio": "4205803",
        },
        "tomador": {
            "cnpj": "35934186000130",
            "razao_social": "NOVA CONSULTORIA",
        },
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "codigo_indicador_operacao": "010101",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 0, "estadual": 0, "municipal": 0},
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
        },
    }
    root = build_unsigned_dps(payload, homologacao=True)
    xml = dps_xml_bytes(root).decode("utf-8")
    assert "<IBSCBS>" in xml
    assert "<CST>000</CST>" in xml
    assert "<cClassTrib>000001</cClassTrib>" in xml
    assert "<cIndOp>010101</cIndOp>" in xml
    ibs = root.find(f"{{{NS}}}infDPS/{{{NS}}}IBSCBS")
    assert ibs is not None
    assert [etree.QName(child).localname for child in ibs] == [
        "finNFSe",
        "indFinal",
        "cIndOp",
        "indDest",
        "valores",
    ]


def test_build_unsigned_dps_nao_optante_reg_trib():
    payload = {
        "data_emissao": "2026-09-06T21:16:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "3",
        "op_simp_nac": "1",
        "regime_especial_tributacao": "0",
        "prestador": {
            "cnpj": "13677964000200",
            "inscricao_municipal": "13942",
            "codigo_municipio": "4205803",
            "telefone": "47999611329",
            "email": "sonia.athayde@lstractor.com.br",
        },
        "tomador": {
            "cnpj": "35934186000130",
            "razao_social": "NOVA CONSULTORIA",
            "endereco": {
                "logradouro": "Rua A",
                "numero": "1",
                "bairro": "Centro",
                "codigo_municipio": "4104204",
                "cep": "83601520",
            },
        },
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "codigo_nbs": "1.2002.90.00",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 10, "estadual": 0, "municipal": 5},
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert "<opSimpNac>1</opSimpNac>" in xml
    assert "<regEspTrib>0</regEspTrib>" in xml
    assert "regApTribSN" not in xml
    assert "<tpRetISSQN>1</tpRetISSQN>" in xml
    assert "<cNBS>120029000</cNBS>" in xml
    assert "<vReceb>" not in xml
    assert "<totTrib>" in xml
    assert "<vTotTrib>" in xml
    assert "<vTotTribFed>10.00</vTotTribFed>" in xml
    assert "<vTotTribMun>5.00</vTotTribMun>" in xml
    assert "<pTotTribSN>" not in xml
    assert "<IBSCBS>" not in xml
    assert "<cClassTrib>" not in xml


def test_build_unsigned_dps_nao_optante_requires_total_tributos():
    payload = {
        "data_emissao": "2026-09-06T21:16:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "3",
        "op_simp_nac": "1",
        "regime_especial_tributacao": "0",
        "prestador": {"cnpj": "13677964000200", "codigo_municipio": "4205803"},
        "tomador": {"cnpj": "35934186000130", "razao_social": "NOVA CONSULTORIA"},
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
        },
    }
    with pytest.raises(SapNfseMapperError, match="total_tributos"):
        build_unsigned_dps(payload, homologacao=True)


def test_build_unsigned_dps_requires_pis_cofins_cst():
    payload = {
        "data_emissao": "2026-09-06T21:16:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "3",
        "op_simp_nac": "3",
        "regime_especial_tributacao": "0",
        "prestador": {"cnpj": "13677964000200", "codigo_municipio": "4205803"},
        "tomador": {"cnpj": "35934186000130", "razao_social": "NOVA"},
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "percentual_total_tributos": 6,
            "tipo_retencao_pis_cofins": "0",
        },
    }
    with pytest.raises(SapNfseMapperError, match="situacao_tributaria_pis_cofins"):
        build_unsigned_dps(payload, homologacao=True)


def test_build_unsigned_dps_omits_incomplete_address_and_cnae():
    payload = {
        "data_emissao": "2026-09-06T21:44:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "4",
        "op_simp_nac": "1",
        "regime_especial_tributacao": "0",
        "prestador": {
            "cnpj": "13677964000200",
            "inscricao_municipal": "13942",
            "codigo_municipio": "4205803",
        },
        "tomador": {
            "cnpj": "35934186000130",
            "razao_social": "NOVA CONSULTORIA",
            "telefone": "41999990000",
            "email": "contato@example.com",
            "endereco": {
                "logradouro": "Rua A",
                "numero": "1",
                "codigo_municipio": "4104204",
                # missing bairro + cep → omit entire end
            },
        },
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "codigo_cnae": "3314710",
            "codigo_nbs": "1.2002.90.00",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 0, "estadual": 0, "municipal": 0},
        },
    }
    root = build_unsigned_dps(payload, homologacao=True)
    xml = dps_xml_bytes(root).decode("utf-8")
    assert "cCNAE" not in xml
    toma = root.find(f"{{{NS}}}infDPS/{{{NS}}}toma")
    assert toma is not None
    assert [etree.QName(child).localname for child in toma] == ["CNPJ", "xNome", "fone", "email"]


def test_build_unsigned_dps_missing_rps(sap_fixture):
    del sap_fixture["serie_rps"]
    with pytest.raises(SapNfseMapperError):
        build_unsigned_dps(sap_fixture, homologacao=True)


def test_gzip_roundtrip():
    raw = b"<DPS>test</DPS>"
    assert gunzip_b64(gzip_b64(raw)) == raw


def test_sefin_urls():
    assert "producaorestrita" in sefin_base_url(homologacao=True)
    assert "producaorestrita" not in sefin_base_url(homologacao=False)


def test_post_dps_authorized(monkeypatch):
    class FakeResp:
        status_code = 200
        content = b"<nfse/>"
        reason = "OK"

        def json(self):
            return {
                "chaveAcesso": "N" + "0" * 49,
                "idDps": "DPS123",
                "nfseXmlGZipB64": gzip_b64(b"<NFSe>ok</NFSe>"),
            }

    session = MagicMock()
    session.post.return_value = FakeResp()

    # Avoid needing a real PFX: stub materialize
    from nfe_gateway.nfse import sefin as sefin_mod

    monkeypatch.setattr(
        sefin_mod,
        "_materialize_mtls_files",
        lambda pfx: (Path("k.pem"), Path("c.pem")),
    )
    monkeypatch.setattr(sefin_mod, "_shred", lambda path: None)

    result = post_dps(signed_xml=b"<DPS/>", pfx=b"fake", homologacao=True, session=session)
    assert result["outcome"] == "authorized"
    assert result["access_key"].startswith("N")
    assert result["response_xml"] == b"<NFSe>ok</NFSe>"


def test_post_dps_rejected(monkeypatch):
    class FakeResp:
        status_code = 400
        content = b'{"erros":[]}'
        reason = "Bad Request"

        def json(self):
            return {"erros": [{"Codigo": "E001", "Descricao": "campo obrigatorio"}]}

    session = MagicMock()
    session.post.return_value = FakeResp()

    from nfe_gateway.nfse import sefin as sefin_mod

    monkeypatch.setattr(
        sefin_mod,
        "_materialize_mtls_files",
        lambda pfx: (Path("k.pem"), Path("c.pem")),
    )
    monkeypatch.setattr(sefin_mod, "_shred", lambda path: None)

    result = post_dps(signed_xml=b"<DPS/>", pfx=b"fake", homologacao=True, session=session)
    assert result["outcome"] == "rejected"
    assert result["error_code"] == "E001"
    assert result["x_motivo"] == "campo obrigatorio"


def test_post_dps_rejected_lowercase_descricao(monkeypatch):
    class FakeResp:
        status_code = 400
        content = b'{"erros":[{"codigo":"E016","descricao":"XML fora do schema"}]}'
        reason = "Bad Request"

        def json(self):
            return {"erros": [{"codigo": "E016", "descricao": "XML fora do schema", "complemento": "infDPS"}]}

    session = MagicMock()
    session.post.return_value = FakeResp()

    from nfe_gateway.nfse import sefin as sefin_mod

    monkeypatch.setattr(
        sefin_mod,
        "_materialize_mtls_files",
        lambda pfx: (Path("k.pem"), Path("c.pem")),
    )
    monkeypatch.setattr(sefin_mod, "_shred", lambda path: None)

    result = post_dps(signed_xml=b"<DPS/>", pfx=b"fake", homologacao=True, session=session)
    assert result["outcome"] == "rejected"
    assert result["cstat"] == "E016"
    assert result["x_motivo"] == "XML fora do schema (infDPS)"
