"""Resolves whether a SEFAZ call runs against homologação or produção, and
carries the mandatory disclaimer homologação NF-e requires.

Two independent signals feed the decision, not one:
- organization_companies.environment (per company — "production" |
  "homologation", the real source of truth once this is live).
- SEFAZ_FORCE_HOMOLOGACAO (deployment-wide safety override, defaults to
  True in .env.example). While the gateway is still being brought up and
  proven out, this makes it impossible for a company record that's
  misconfigured — or just prematurely flipped to "production" — to cause a
  real call to production SEFAZ. Flip it to false only once you're
  deliberately ready to transmit for real.
"""

from __future__ import annotations

HOMOLOGACAO_DISCLAIMER = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
"""Mandatory content of infCpl (informações complementares) for any
homologação NF-e — SEFAZ rejects the document if this text is missing. Not
optional, not a style choice: it's in the NF-e technical manual. Whatever
eventually builds the NFe XML (see sefaz/client.py — not written yet) must
inject this into infCpl whenever resolve_homologacao() returns True."""


def resolve_homologacao(company_environment: str, force_homologacao: bool) -> bool:
    """True means "call SEFAZ homologação", never produção."""
    if force_homologacao:
        return True
    return company_environment == "homologation"
