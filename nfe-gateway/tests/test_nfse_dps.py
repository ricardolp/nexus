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
    resolve_c_ind_op,
)
from nfe_gateway.nfse.sefin import gzip_b64, gunzip_b64, is_calculator_unavailable, post_dps, sefin_base_url


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
    assert [etree.QName(child).localname for child in cserv] == ["cTribNac", "cNBS", "xDescServ"]
    inf = root.find(f"{{{NS}}}infDPS")
    header = [etree.QName(child).localname for child in inf]
    assert header.index("tpEmit") < header.index("finNFSe") < header.index("cLocEmi")
    assert "indDest" not in header
    assert inf.findtext(f"{{{NS}}}finNFSe") == "0"
    assert inf.find(f"{{{NS}}}tpNFSeDebito") is None
    assert inf.find(f"{{{NS}}}tpNFSeCredito") is None
    ibs = root.find(f"{{{NS}}}infDPS/{{{NS}}}IBSCBS")
    assert ibs is not None
    assert [etree.QName(child).localname for child in ibs] == [
        "indFinal",
        "cIndOp",
        "indDest",
        "valores",
    ]
    trib = ibs.find(f"{{{NS}}}valores/{{{NS}}}trib")
    assert [etree.QName(child).localname for child in trib] == ["CST", "cClassTrib"]


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
    assert root.findtext(f"{{{NS}}}infDPS/{{{NS}}}finNFSe") == "0"


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
    assert "<cClassTrib>000001</cClassTrib>" in xml
    assert "<cIndOp>010101</cIndOp>" in xml
    inf = root.find(f"{{{NS}}}infDPS")
    header = [etree.QName(child).localname for child in inf]
    assert header.index("finNFSe") < header.index("cLocEmi")
    assert inf.findtext(f"{{{NS}}}finNFSe") == "0"
    ibs = root.find(f"{{{NS}}}infDPS/{{{NS}}}IBSCBS")
    assert "indDest" not in header
    assert [etree.QName(child).localname for child in ibs] == [
        "indFinal",
        "cIndOp",
        "indDest",
        "valores",
    ]


def test_build_unsigned_dps_item_1401_cst_000_infers_cindop_at_supplier():
    """Alinhamento (14.01) with CST 000 and no cIndOp: service on movable property at the shop."""
    payload = {
        "data_emissao": "2026-10-06T00:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "001",
        "numero_rps": "1002",
        "op_simp_nac": "1",
        "finalidade_emissao": "0",
        "consumidor_final": "1",
        "indicador_destinatario": "0",
        "prestador": {"cnpj": "05523987000223", "codigo_municipio": "2919553"},
        "tomador": {"cpf": "23039146807", "razao_social": "TOMADOR"},
        "servico": {
            "valor_servicos": 80,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "ALINHAMENTO BI-DIRECIONAL",
            "codigo_municipio": "2919553",
            "situacao_tributaria_pis_cofins": "01",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 0, "estadual": 0, "municipal": 0},
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert resolve_c_ind_op(payload, payload["servico"]) == ("050101", "regra")
    assert "<IBSCBS>" in xml
    assert "<cClassTrib>000001</cClassTrib>" in xml
    assert "<cIndOp>050101</cIndOp>" in xml


def test_build_unsigned_dps_item_1401_offsite_infers_050102():
    payload = {
        "data_emissao": "2026-10-06T00:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "001",
        "numero_rps": "1002",
        "op_simp_nac": "1",
        "prestador": {"cnpj": "05523987000223", "codigo_municipio": "2919553"},
        "tomador": {"cpf": "23039146807", "razao_social": "TOMADOR"},
        "servico": {
            "valor_servicos": 80,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "ALINHAMENTO",
            "codigo_municipio": "2927408",
            "situacao_tributaria_pis_cofins": "01",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 0, "estadual": 0, "municipal": 0},
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert resolve_c_ind_op(payload, payload["servico"]) == ("050102", "regra")
    assert "<cIndOp>050102</cIndOp>" in xml


def test_build_unsigned_dps_requires_cindop_when_classified():
    payload = {
        "data_emissao": "2026-09-27T00:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "001",
        "numero_rps": "1",
        "op_simp_nac": "1",
        "prestador": {"cnpj": "13677964000200", "codigo_municipio": "4205803"},
        "tomador": {"cnpj": "35934186000130", "razao_social": "NOVA CONSULTORIA"},
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "01.06",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 0, "estadual": 0, "municipal": 0},
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
        },
    }
    with pytest.raises(SapNfseMapperError, match="cIndOp ausente"):
        build_unsigned_dps(payload, homologacao=True)


def _ibscbs_payload(**servico_extra):
    payload = {
        "data_emissao": "2026-10-07T10:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "10",
        "op_simp_nac": "1",
        "prestador": {"cnpj": "13677964000200", "codigo_municipio": "4205803"},
        "tomador": {"cnpj": "35934186000130", "razao_social": "NOVA CONSULTORIA"},
        "servico": {
            "valor_servicos": 200,
            "iss_retido": False,
            "item_lista_servico": "17.01",
            "discriminacao": "Consultoria",
            "codigo_municipio": "4205803",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "total_tributos": {"federal": 0, "estadual": 0, "municipal": 0},
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
        },
    }
    payload["servico"].update(servico_extra)
    return payload


def test_ibscbs_explicit_cindop_must_have_six_digits():
    with pytest.raises(SapNfseMapperError, match="6 dígitos"):
        build_unsigned_dps(_ibscbs_payload(codigo_indicador_operacao="1003"), homologacao=True)
    # JSON number loses the leading zero (050101 → 50101): restored.
    payload = _ibscbs_payload(codigo_indicador_operacao=50101)
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True))
    assert resolve_c_ind_op(payload, payload["servico"]) == ("050101", "payload")
    assert b"<cIndOp>050101</cIndOp>" in xml


def test_ibscbs_partial_classification_is_rejected():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["servico"].pop("ibs_cbs_classificacao_tributaria")
    with pytest.raises(SapNfseMapperError, match="incompleto"):
        build_unsigned_dps(payload, homologacao=True)


def test_ibscbs_cclasstrib_must_match_cst():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301", ibs_cbs_classificacao_tributaria="200001")
    with pytest.raises(SapNfseMapperError, match="não pertence ao CST"):
        build_unsigned_dps(payload, homologacao=True)


def test_ibscbs_ind_dest_1_requires_destinatario():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["indicador_destinatario"] = "1"
    with pytest.raises(SapNfseMapperError, match="destinatario"):
        build_unsigned_dps(payload, homologacao=True)


def test_ibscbs_ind_dest_1_emits_dest_group():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["indicador_destinatario"] = "1"
    payload["destinatario"] = {"cpf": "12345678909", "razao_social": "FULANO DE TAL"}
    root = build_unsigned_dps(payload, homologacao=True)
    ibs = root.find(f"{{{NS}}}infDPS/{{{NS}}}IBSCBS")
    assert [etree.QName(c).localname for c in ibs] == [
        "indFinal", "cIndOp", "indDest", "dest", "valores",
    ]
    dest = ibs.find(f"{{{NS}}}dest")
    assert dest.findtext(f"{{{NS}}}CPF") == "12345678909"
    assert dest.findtext(f"{{{NS}}}xNome") == "FULANO DE TAL"
    trib = ibs.find(f"{{{NS}}}valores/{{{NS}}}trib")
    assert [etree.QName(child).localname for child in trib] == ["CST", "cClassTrib"]


def test_fin_nfse_debito_sits_before_c_loc_emi():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["finalidade_emissao"] = "2"
    payload["tipo_nfse_debito"] = "4"
    root = build_unsigned_dps(payload, homologacao=True)
    inf = root.find(f"{{{NS}}}infDPS")
    names = [etree.QName(child).localname for child in inf]
    assert names.index("finNFSe") < names.index("tpNFSeDebito") < names.index("cLocEmi")
    assert inf.findtext(f"{{{NS}}}finNFSe") == "2"
    assert inf.findtext(f"{{{NS}}}tpNFSeDebito") == "04"
    assert inf.find(f"{{{NS}}}tpNFSeCredito") is None
    ibs = inf.find(f"{{{NS}}}IBSCBS")
    assert "finNFSe" not in [etree.QName(child).localname for child in ibs]


def test_fin_nfse_credito_sits_before_c_loc_emi():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["finalidade_emissao"] = "1"
    payload["tipo_nfse_credito"] = "05"
    root = build_unsigned_dps(payload, homologacao=True)
    inf = root.find(f"{{{NS}}}infDPS")
    names = [etree.QName(child).localname for child in inf]
    assert names.index("finNFSe") < names.index("tpNFSeCredito") < names.index("cLocEmi")
    assert inf.findtext(f"{{{NS}}}tpNFSeCredito") == "05"
    assert inf.find(f"{{{NS}}}tpNFSeDebito") is None


def test_fin_nfse_regular_omits_adjustment_type():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["finalidade_emissao"] = "0"
    payload["tipo_nfse_debito"] = "01"
    root = build_unsigned_dps(payload, homologacao=True)
    inf = root.find(f"{{{NS}}}infDPS")
    assert inf.findtext(f"{{{NS}}}finNFSe") == "0"
    assert inf.find(f"{{{NS}}}tpNFSeDebito") is None


def test_tipo_nfse_debito_rejects_unknown_code():
    payload = _ibscbs_payload(codigo_indicador_operacao="100301")
    payload["finalidade_emissao"] = "2"
    payload["tipo_nfse_debito"] = "99"
    with pytest.raises(SapNfseMapperError, match="tpNFSeDebito"):
        build_unsigned_dps(payload, homologacao=True)


def test_desconto_incondicionado_goes_between_vserv_and_trib():
    """SAP desconto_incondicionado must become vDescIncond so SEFIN and DANFSE see it."""
    root = build_unsigned_dps(
        _ibscbs_payload(codigo_indicador_operacao="100301", desconto_incondicionado=15, desconto_condicionado=0),
        homologacao=True,
    )
    valores = root.find(f"{{{NS}}}infDPS/{{{NS}}}valores")
    assert [etree.QName(c).localname for c in valores] == ["vServPrest", "vDescCondIncond", "trib"]
    desc = valores.find(f"{{{NS}}}vDescCondIncond")
    assert [etree.QName(c).localname for c in desc] == ["vDescIncond"]
    assert desc.findtext(f"{{{NS}}}vDescIncond") == "15.00"


def test_desconto_condicionado_and_incondicionado():
    root = build_unsigned_dps(
        _ibscbs_payload(
            codigo_indicador_operacao="100301",
            desconto_incondicionado="15.00",
            desconto_condicionado=5,
        ),
        homologacao=True,
    )
    desc = root.find(f"{{{NS}}}infDPS/{{{NS}}}valores/{{{NS}}}vDescCondIncond")
    assert desc.findtext(f"{{{NS}}}vDescIncond") == "15.00"
    assert desc.findtext(f"{{{NS}}}vDescCond") == "5.00"


def test_desconto_zero_is_omitted():
    xml = dps_xml_bytes(
        build_unsigned_dps(_ibscbs_payload(codigo_indicador_operacao="100301"), homologacao=True)
    )
    assert b"vDescCondIncond" not in xml
    assert b"vDescIncond" not in xml


def test_desconto_cannot_exceed_service_amount():
    with pytest.raises(SapNfseMapperError, match="valor_servicos"):
        build_unsigned_dps(
            _ibscbs_payload(codigo_indicador_operacao="100301", desconto_incondicionado=201),
            homologacao=True,
        )


def test_cindop_rule_table_is_loaded():
    from nfe_gateway.nfse.dps import _cindop_rules

    rules = _cindop_rules()
    assert rules["140101"]["estabelecimento_fornecedor"] == "050101"
    assert rules["140101"]["outro_local"] == "050102"


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
            "aliquota": 0.05,
            "total_tributos": {"federal": 10, "estadual": 0, "municipal": 5},
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert "<opSimpNac>1</opSimpNac>" in xml
    assert "<pAliq>" not in xml
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


def test_build_unsigned_dps_nao_optante_from_sap_percentages():
    """SAP sends percentual_total_tributos_fed/est/mun; DPS wants money."""
    payload = {
        "data_emissao": "2026-09-27T00:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "001",
        "numero_rps": "1",
        "optante_simples_nacional": False,
        "percentual_total_tributos_fed": 13.45,
        "percentual_total_tributos_est": 0,
        "percentual_total_tributos_mun": 0.05,
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
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert "<opSimpNac>1</opSimpNac>" in xml
    assert "<vTotTribFed>26.90</vTotTribFed>" in xml
    assert "<vTotTribEst>0.00</vTotTribEst>" in xml
    assert "<vTotTribMun>10.00</vTotTribMun>" in xml


def test_build_unsigned_dps_nao_optante_percent_split_uses_invoice_taxes():
    """78.72 + 21.28 = 100 is the share of PIS/COFINS vs ISS, not a rate on the price."""
    payload = {
        "data_emissao": "2026-10-13T00:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "001",
        "numero_rps": "1031",
        "optante_simples_nacional": "2",
        "percentual_total_tributos_fed": 78.72,
        "percentual_total_tributos_mun": 21.28,
        "prestador": {"cnpj": "13677964000200", "codigo_municipio": "2919553"},
        "tomador": {"cnpj": "35934186000130", "razao_social": "CLIENTE"},
        "servico": {
            "valor_servicos": 280,
            "desconto_incondicionado": 15,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "2919553",
            "aliquota": 2.5,
            "aliquota_pis": 1.65,
            "aliquota_cofins": 7.6,
            "valor_pis": 4.38,
            "valor_cofins": 20.14,
            "valor_iss": 6.63,
            "situacao_tributaria_pis_cofins": "01",
            "tipo_retencao_pis_cofins": "0",
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert "<vTotTribFed>24.52</vTotTribFed>" in xml
    assert "<vTotTribEst>0.00</vTotTribEst>" in xml
    assert "<vTotTribMun>6.63</vTotTribMun>" in xml
    assert "<vTotTribFed>220.42</vTotTribFed>" not in xml
    assert "<vTotTribMun>59.58</vTotTribMun>" not in xml


def test_build_unsigned_dps_nao_optante_partial_percent_fills_zero():
    payload = {
        "data_emissao": "2026-09-27T00:00:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "1",
        "op_simp_nac": "1",
        "prestador": {"cnpj": "13677964000200", "codigo_municipio": "4205803"},
        "tomador": {"cnpj": "35934186000130", "razao_social": "NOVA"},
        "servico": {
            "valor_servicos": 1000,
            "iss_retido": False,
            "item_lista_servico": "14.01",
            "discriminacao": "Manutencao",
            "codigo_municipio": "4205803",
            "situacao_tributaria_pis_cofins": "00",
            "tipo_retencao_pis_cofins": "0",
            "percentual_total_tributos_fed": 10,
        },
    }
    xml = dps_xml_bytes(build_unsigned_dps(payload, homologacao=True)).decode("utf-8")
    assert "<vTotTribFed>100.00</vTotTribFed>" in xml
    assert "<vTotTribEst>0.00</vTotTribEst>" in xml
    assert "<vTotTribMun>0.00</vTotTribMun>" in xml


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


def _stub_mtls(monkeypatch):
    from nfe_gateway.nfse import sefin as sefin_mod

    monkeypatch.setattr(sefin_mod, "_materialize_mtls_files", lambda pfx: (Path("k.pem"), Path("c.pem")))
    monkeypatch.setattr(sefin_mod, "_shred", lambda path: None)


@pytest.mark.parametrize(
    "descricao",
    [
        'A calculadora integrada ao sistema NFS-e retornou o seguinte erro: "The operation has timed out".',
        'A calculadora integrada ao sistema NFS-e retornou o seguinte erro: "A task was canceled."',
    ],
)
def test_post_dps_calculator_timeout_is_retried(monkeypatch, descricao):
    class FakeResp:
        status_code = 500
        content = b"{}"
        reason = "Internal Server Error"

        def json(self):
            return {"erros": [{"codigo": "E1000", "descricao": descricao}]}

    session = MagicMock()
    session.post.return_value = FakeResp()
    _stub_mtls(monkeypatch)

    result = post_dps(signed_xml=b"<DPS/>", pfx=b"fake", homologacao=True, session=session)
    assert is_calculator_unavailable(descricao)
    assert result["outcome"] == "retry"
    assert result["error_code"] == "E1000"
    assert "calculadora" in result["error_message"]


def test_post_dps_connection_timeout_is_retried(monkeypatch):
    import requests

    session = MagicMock()
    session.post.side_effect = requests.Timeout("read timed out")
    _stub_mtls(monkeypatch)

    result = post_dps(signed_xml=b"<DPS/>", pfx=b"fake", homologacao=True, session=session)
    assert result["outcome"] == "retry"
    assert result["error_code"] == "calculator_timeout"
    assert result["signed_xml"] == b"<DPS/>"
