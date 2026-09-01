from nfe_gateway.sefaz.environment import HOMOLOGACAO_DISCLAIMER, resolve_homologacao


def test_force_homologacao_wins_even_if_company_says_production():
    assert resolve_homologacao("production", force_homologacao=True) is True


def test_company_homologation_used_when_not_forced():
    assert resolve_homologacao("homologation", force_homologacao=False) is True


def test_company_production_used_when_not_forced():
    assert resolve_homologacao("production", force_homologacao=False) is False


def test_disclaimer_text_matches_the_nfe_technical_manual_wording():
    assert HOMOLOGACAO_DISCLAIMER == "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
