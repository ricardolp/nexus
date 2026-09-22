"""Tests for contingency tpEmis helpers."""

from nfe_gateway.sefaz.contingency import (
    autorizacao_contingencia_flag,
    requires_dhcont_xjust,
    resolve_tp_emis,
    tp_emis_from_chave,
    uses_svc_endpoint,
)


def test_tp_emis_from_chave_digit_35():
    # 44-digit key; digit 35 (1-based) = index 34
    chave = "35" + ("0" * 32) + "6" + ("0" * 9)  # digit 35 = 6 (SVC-AN)
    assert len("".join(c for c in chave if c.isdigit())) == 44
    assert tp_emis_from_chave(chave) == 6


def test_resolve_tp_emis_chave_wins():
    chave = "35" + ("0" * 32) + "7" + ("0" * 9)
    sap = {"tipo_emissao": "1", "chave_acesso": chave}
    assert resolve_tp_emis(sap) == 7


def test_resolve_tp_emis_payload_fallback():
    assert resolve_tp_emis({"tipo_emissao": "6"}) == 6
    assert resolve_tp_emis({}) == 1


def test_svc_and_dhcont_rules():
    assert uses_svc_endpoint(6)
    assert uses_svc_endpoint(7)
    assert not uses_svc_endpoint(1)
    assert requires_dhcont_xjust(5)
    assert not requires_dhcont_xjust(6)
    assert autorizacao_contingencia_flag(6)
    assert not autorizacao_contingencia_flag(1)
