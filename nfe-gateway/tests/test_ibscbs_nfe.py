"""IBS/CBS da NF-e montado a partir da tabela CST/cClassTrib (NT 2025.002-RTC v1.50).

Cada grupo gerado é validado contra os tipos oficiais (TTribNFe e
TIBSCBSMonoTot) do pacote PL_010 em tests/xsd/PL_010_v1.50.
"""

from __future__ import annotations

import copy
import json
from decimal import Decimal
from pathlib import Path

import pytest
from lxml import etree

from nfe_gateway.sefaz.ibscbs_nfe import (
    IbsCbsMapperError,
    build_item_ibscbs,
    groups_for,
    mono_regime,
)
from nfe_gateway.sefaz.sap_nfe import SapNfeMapperError, build_unsigned_xml

NS = "http://www.portalfiscal.inf.br/nfe"
XSD_DIR = Path(__file__).parent / "xsd" / "PL_010_v1.50"
FIXTURES = Path(__file__).parent / "fixtures"

_FRAG = etree.XMLSchema(etree.parse(str(XSD_DIR / "rtc_fragmentos.xsd")))
_NFE = etree.XMLSchema(etree.parse(str(XSD_DIR / "nfe_v4.00.xsd")))


def _valid_fragment(el: etree._Element) -> None:
    doc = etree.fromstring(etree.tostring(el))
    if not _FRAG.validate(doc):
        raise AssertionError("; ".join(str(e) for e in _FRAG.error_log))


def _names(el: etree._Element | None) -> list[str]:
    return [etree.QName(c).localname for c in el] if el is not None else []


def _ns(path: str) -> str:
    return "/".join(f"{{{NS}}}{p}" for p in path.split("/"))


def _item(**extra) -> dict:
    base = {
        "numero_item": 1,
        "ibs_cbs_situacao_tributaria": "000",
        "ibs_cbs_classificacao_tribut": "000001",
        "ibs_cbs_base_calculo": 1000,
        "ibs_uf_aliquota": 0.1,
        "ibs_uf_valor": 1.00,
        "ibs_mun_aliquota": 0,
        "ibs_mun_valor": 0,
        "cbs_aliquota": 0.9,
        "cbs_valor": 9.00,
    }
    base.update(extra)
    return base


# --------------------------------------------------------------------------- #
# Tabela
# --------------------------------------------------------------------------- #


def test_table_groups_by_cst():
    assert groups_for("000", "000001")["gIBSCBS"] == "obrigatorio"
    assert "gIBSCBS" not in groups_for("400", "400001")
    assert "gIBSCBS" not in groups_for("410", "410001")
    assert groups_for("620", "620001")["gIBSCBSMono"] == "obrigatorio"
    assert groups_for("200", "200001")["gRed"] == "obrigatorio"
    assert groups_for("510", "510001")["gDif"] == "obrigatorio"
    assert groups_for("800", "800001")["gTransfCred"] == "obrigatorio"
    with pytest.raises(IbsCbsMapperError, match="desconhecido"):
        groups_for("999", "999001")


# --------------------------------------------------------------------------- #
# Itens
# --------------------------------------------------------------------------- #


def test_cst_000_full_group_and_xsd():
    el, tot = build_item_ibscbs(_item(), year=2026)
    _valid_fragment(el)
    g = el.find(_ns("gIBSCBS"))
    assert _names(g) == ["vBC", "gIBSUF", "gIBSMun", "vIBS", "gCBS"]
    assert g.findtext(_ns("gIBSUF/pIBSUF")) == "0.1000"
    assert g.findtext(_ns("gCBS/vCBS")) == "9.00"
    assert tot["v_ibs"] == Decimal("1.00")


@pytest.mark.parametrize("cst", ["011", "220", "221", "222", "830"])
def test_taxed_csts_previously_dropped_now_carry_values(cst):
    """PyNFe left these without gIBSCBS (values lost, totals zeroed)."""
    el, _ = build_item_ibscbs(
        _item(ibs_cbs_situacao_tributaria=cst, ibs_cbs_classificacao_tribut=f"{cst}001"), year=2026
    )
    _valid_fragment(el)
    assert el.find(_ns("gIBSCBS")) is not None


@pytest.mark.parametrize("cst", ["400", "410"])
def test_exempt_csts_never_carry_gibscbs(cst):
    """PyNFe emitted gIBSCBS with values for CST 400 (isenção)."""
    el, tot = build_item_ibscbs(
        _item(ibs_cbs_situacao_tributaria=cst, ibs_cbs_classificacao_tribut=f"{cst}001"), year=2026
    )
    _valid_fragment(el)
    assert _names(el) == ["CST", "cClassTrib"]
    assert tot == {}


def test_cst_200_requires_and_emits_gred():
    with pytest.raises(IbsCbsMapperError, match="pRedAliq"):
        build_item_ibscbs(
            _item(ibs_cbs_situacao_tributaria="200", ibs_cbs_classificacao_tribut="200001",
                  ibs_uf_valor=0.40, cbs_valor=3.60),
            year=2026,
        )
    el, _ = build_item_ibscbs(
        _item(
            ibs_cbs_situacao_tributaria="200", ibs_cbs_classificacao_tribut="200003",
            ibs_uf_percentual_reducao_aliq=60, ibs_mun_percentual_reduc_aliq=60,
            cbs_percentual_reducao_aliq=60, ibs_uf_valor=0.40, cbs_valor=3.60,
        ),
        year=2026,
    )
    _valid_fragment(el)
    uf = el.find(_ns("gIBSCBS/gIBSUF"))
    assert _names(uf) == ["pIBSUF", "gRed", "vIBSUF"]
    assert uf.findtext(_ns("gRed/pRedAliq")) == "60.0000"
    assert uf.findtext(_ns("gRed/pAliqEfet")) == "0.0400"
    assert el.findtext(_ns("gIBSCBS/gCBS/gRed/pAliqEfet")) == "0.3600"


def test_cst_510_diferimento_computes_vdif():
    el, tot = build_item_ibscbs(
        _item(ibs_cbs_situacao_tributaria="510", ibs_cbs_classificacao_tribut="510001",
              ibs_cbs_percentual_diferimento=100, ibs_uf_valor=0, cbs_valor=0),
        year=2026,
    )
    _valid_fragment(el)
    uf = el.find(_ns("gIBSCBS/gIBSUF"))
    assert _names(uf) == ["pIBSUF", "gDif", "vIBSUF"]
    assert uf.findtext(_ns("gDif/pDif")) == "100.0000"
    assert uf.findtext(_ns("gDif/vDif")) == "1.00"
    assert el.findtext(_ns("gIBSCBS/gCBS/gDif/vDif")) == "9.00"
    assert tot["v_dif_cbs"] == Decimal("9.00")


def test_cst_515_dif_and_red_in_schema_order():
    el, _ = build_item_ibscbs(
        _item(ibs_cbs_situacao_tributaria="515", ibs_cbs_classificacao_tribut="515001",
              ibs_cbs_percentual_diferimento=50, ibs_cbs_percentual_reducao=60,
              ibs_uf_valor=0.20, cbs_valor=1.80),
        year=2026,
    )
    _valid_fragment(el)
    assert _names(el.find(_ns("gIBSCBS/gCBS"))) == ["pCBS", "gDif", "gRed", "vCBS"]


def test_values_must_match_base_times_rate():
    with pytest.raises(IbsCbsMapperError, match="fração"):
        build_item_ibscbs(_item(ibs_uf_aliquota=0.001, cbs_aliquota=0.009), year=2026)
    with pytest.raises(IbsCbsMapperError, match="não confere"):
        build_item_ibscbs(_item(cbs_valor=12.34), year=2026)


def test_classification_rules():
    with pytest.raises(IbsCbsMapperError, match="juntos"):
        build_item_ibscbs(_item(ibs_cbs_classificacao_tribut=""), year=2026)
    with pytest.raises(IbsCbsMapperError, match="não pertence ao CST"):
        build_item_ibscbs(_item(ibs_cbs_classificacao_tribut="200001"), year=2026)
    el, tot = build_item_ibscbs({"numero_item": 1}, year=2026)
    assert el is None and tot == {}


def test_transf_cred_ajuste_zfm():
    el, _ = build_item_ibscbs(
        {"ibs_cbs_situacao_tributaria": "800", "ibs_cbs_classificacao_tribut": "800001",
         "ibs_valor_transferido": 10, "cbs_valor_transferido": 90},
        year=2026,
    )
    _valid_fragment(el)
    assert _names(el) == ["CST", "cClassTrib", "gTransfCred"]

    el, _ = build_item_ibscbs(
        {"ibs_cbs_situacao_tributaria": "811", "ibs_cbs_classificacao_tribut": "811001",
         "data_competencia_apuracao": "2026-09-01", "ibs_valor_ajuste_competencia": 1,
         "cbs_valor_ajuste_competencia": 2},
        year=2026,
    )
    _valid_fragment(el)
    assert el.findtext(_ns("gAjusteCompet/competApur")) == "2026-09"

    el, _ = build_item_ibscbs(
        {"ibs_cbs_situacao_tributaria": "810", "ibs_cbs_classificacao_tribut": "810001",
         "credito_presumido_zfm_competen": "202609", "credito_presumido_zfm_classifi": "2",
         "credito_presumido_zfm_valor": 5},
        year=2026,
    )
    _valid_fragment(el)
    assert _names(el) == ["CST", "cClassTrib", "gCredPresIBSZFM"]


def test_estorno_e_credito_presumido_oper():
    el, tot = build_item_ibscbs(
        _item(ibs_valor_estorno_credito=1.5, cbs_valor_estorno_credito=2.5,
              credito_presumido_oper_codigo="1", credito_presumido_oper_base_ca=1000,
              ibs_credito_percentual=1, ibs_valor_credito_presumido=10,
              cbs_credito_percentual=2, cbs_valor_condicao_suspensiva=20),
        year=2026,
    )
    _valid_fragment(el)
    assert _names(el) == ["CST", "cClassTrib", "gIBSCBS", "gEstornoCred", "gCredPresOper"]
    assert el.findtext(_ns("gCredPresOper/cCredPres")) == "01"
    assert el.findtext(_ns("gCredPresOper/gCBSCredPres/vCredPresCondSus")) == "20.00"


def test_ind_doacao():
    el, _ = build_item_ibscbs(_item(ibs_cbs_indicacao_doacao="1"), year=2026)
    _valid_fragment(el)
    assert _names(el)[:3] == ["CST", "cClassTrib", "indDoacao"]


# --------------------------------------------------------------------------- #
# Monofásico (CST 620) — layout reformulado v1.50 (produção 03/11/2026)
# --------------------------------------------------------------------------- #


def test_mono_regime_by_year():
    assert mono_regime(2026) == ("AdValorem", "AdValorem")
    assert mono_regime(2027) == ("AdValorem", "AdRem")
    assert mono_regime(2028) == ("AdValorem", "AdRem")
    assert mono_regime(2029) == ("AdRem", "AdRem")


def _mono_item(**extra):
    item = _item(ibs_cbs_situacao_tributaria="620", ibs_cbs_classificacao_tribut="620001")
    item.update(extra)
    return item


def test_mono_2026_ad_valorem_from_regular_fields():
    el, tot = build_item_ibscbs(_mono_item(), year=2026)
    _valid_fragment(el)
    mono = el.find(_ns("gIBSCBSMono"))
    assert _names(mono) == ["gIBSMonoAdValorem", "gCBSMonoAdValorem", "vTotIBSMonoItem", "vTotCBSMonoItem"]
    assert mono.findtext(_ns("gIBSMonoAdValorem/gMonoPadrao/vBCMono")) == "1000.00"
    assert mono.findtext(_ns("gIBSMonoAdValorem/gMonoPadrao/vIBSMono")) == "1.00"
    assert mono.findtext(_ns("gCBSMonoAdValorem/gMonoPadrao/pAliqMonoCBS")) == "0.9000"
    assert mono.findtext(_ns("vTotCBSMonoItem")) == "9.00"
    assert el.find(_ns("gIBSCBS")) is None
    assert tot["v_cbs_mono"] == Decimal("9.00")


def test_mono_2027_cbs_ad_rem_requires_quantity():
    item = _mono_item(
        mono_base_calculo_quantidade_t=1000, mono_cbs_aliquota_ad_rem=0.0123, mono_cbs_valor=12.30,
        ibs_uf_valor=1.00,
    )
    el, _ = build_item_ibscbs(item, year=2027)
    _valid_fragment(el)
    mono = el.find(_ns("gIBSCBSMono"))
    assert mono.find(_ns("gCBSMonoAdRem/gMonoPadrao/qBCMono")).text == "1000.0000"
    assert mono.find(_ns("gIBSMonoAdValorem")) is not None


def test_mono_without_values_is_an_error():
    item = {"ibs_cbs_situacao_tributaria": "620", "ibs_cbs_classificacao_tribut": "620001"}
    with pytest.raises(IbsCbsMapperError, match="monofásica"):
        build_item_ibscbs(item, year=2026)


def test_mono_retencao_retido_e_biodiesel():
    item = _mono_item(
        ibs_cbs_classificacao_tribut="620004",
        mono_base_calculo_valor_reten=500, mono_ibs_aliquota_retencao=0.1, mono_ibs_valor_retencao=0.5,
        mono_cbs_valor_retido_ante=3,
        mono_quantidade_bio_comb=10, mono_ibs_valor_diferenca=0.1, mono_cbs_valor_diferenca=0.9,
    )
    el, _ = build_item_ibscbs(item, year=2026)
    _valid_fragment(el)
    ibs = el.find(_ns("gIBSCBSMono/gIBSMonoAdValorem"))
    assert _names(ibs) == ["gMonoPadrao", "gMonoReten", "gpBioDiferenca"]
    assert _names(el.find(_ns("gIBSCBSMono/gCBSMonoAdValorem"))) == ["gMonoPadrao", "gMonoRet", "gpBioDiferenca"]
    assert el.findtext(_ns("gIBSCBSMono/vTotIBSMonoItem")) == "1.50"


# --------------------------------------------------------------------------- #
# NF-e completa
# --------------------------------------------------------------------------- #


def _xsd_errors(xml: etree._Element, *names: str) -> list[str]:
    _NFE.validate(xml)
    return [
        str(e) for e in _NFE.error_log
        if "Signature" not in e.message and any(n in e.message for n in names)
    ]


_RTC_TAGS = ("IBSCBS", "gIBS", "gCBS", "gMono", "vBCIBSCBS", "NFref", "refNFe", "gCompraGov",
             "gPagAntecipado", "DFeReferenciado", "chaveAcesso", "nItem", "pRedutor", "refDFeAnt")


def test_real_sap_payload_is_xsd_valid():
    sap = json.loads((FIXTURES / "sap_nfe_outbound_abap_real_normalized.json").read_text(encoding="utf-8"))
    xml = build_unsigned_xml(sap, homologacao=True)
    _NFE.validate(xml)
    errors = [str(e) for e in _NFE.error_log if "Signature" not in e.message]
    assert errors == []
    tot = xml.find(f".//{{{NS}}}IBSCBSTot")
    assert tot.findtext(_ns("gIBS/vIBS")) == "164.67"
    assert tot.findtext(_ns("gCBS/vCBS")) == "1482.03"


def test_totals_sum_items_including_mono():
    sap = json.loads((FIXTURES / "sap_nfe_outbound.json").read_text(encoding="utf-8"))
    second = copy.deepcopy(sap["items"][0])
    second.update({"numero_item": 2, "ibs_cst": "620", "ibs_c_class_trib": "620001",
                   "cbs_cst": "620", "cbs_c_class_trib": "620001"})
    sap["items"].append(second)
    sap["valor_produtos"] = 2000.00
    sap["valor_total"] = 2000.00
    xml = build_unsigned_xml(sap, homologacao=True)
    assert _xsd_errors(xml, *_RTC_TAGS) == []
    tot = xml.find(f".//{{{NS}}}IBSCBSTot")
    assert _names(tot) == ["vBCIBSCBS", "gIBS", "gCBS", "gMono"]
    assert tot.findtext(_ns("vBCIBSCBS")) == "1000.00"  # mono item has no gIBSCBS
    assert tot.findtext(_ns("gIBS/vIBS")) == "1.00"
    assert tot.findtext(_ns("gMono/vCBSMono")) == "9.00"


def test_mapper_error_surfaces_as_sap_mapper_error():
    sap = json.loads((FIXTURES / "sap_nfe_outbound.json").read_text(encoding="utf-8"))
    sap["items"][0]["cbs_valor"] = 99.0
    with pytest.raises(SapNfeMapperError, match="vCBS"):
        build_unsigned_xml(sap, homologacao=True)
