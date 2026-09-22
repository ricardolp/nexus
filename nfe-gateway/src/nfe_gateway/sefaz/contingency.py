"""Contingency (tpEmis) helpers for NF-e emission.

Rules ported from the production legacy messenger:
- Prefer tpEmis from digit 35 of a precomputed access key (1-based index 35).
- Fall back to tipo_emissao / forma_emissao from the SAP payload.
- Contingência = tpEmis in {2,3,4,5,6,7,9}.
- dhCont/xJust only required for tpEmis 2–5 (FS/SCAN/DPEC/FS-DA).
- SVC-AN (6) / SVC-RS (7) need autorizacao(contingencia=True) so PyNFe
  routes to the SVC webservice — without flipping tpEmis to 9.
"""

from __future__ import annotations

from typing import Any

CONTINGENCIA_TP_EMIS = frozenset({2, 3, 4, 5, 6, 7, 9})
DHCONT_XJUST_TP_EMIS = frozenset({2, 3, 4, 5})
SVC_TP_EMIS = frozenset({6, 7})  # SVC-AN, SVC-RS


def tp_emis_from_chave(chave: str | None) -> int | None:
    """Access key digit 35 (1-based) encodes tpEmis. Returns None if invalid."""
    if not chave:
        return None
    digits = "".join(ch for ch in str(chave) if ch.isdigit())
    if len(digits) < 35:
        return None
    try:
        return int(digits[34])  # 0-based index 34 = digit 35
    except ValueError:
        return None


def resolve_tp_emis(sap: dict[str, Any]) -> int:
    """Resolve tpEmis: chave digit 35 wins over payload tipo_emissao."""
    chave = sap.get("chave_acesso")
    if chave is None:
        for k, v in sap.items():
            if isinstance(k, str) and k.lower() == "chave_acesso":
                chave = v
                break
    from_key = tp_emis_from_chave(chave)
    if from_key is not None:
        return from_key
    raw = sap.get("tipo_emissao") or sap.get("forma_emissao")
    if raw is None:
        for k, v in sap.items():
            if isinstance(k, str) and k.lower() in ("tipo_emissao", "forma_emissao"):
                raw = v
                break
    if raw is None:
        raw = "1"
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 1


def is_contingencia(tp_emis: int) -> bool:
    return tp_emis in CONTINGENCIA_TP_EMIS


def requires_dhcont_xjust(tp_emis: int) -> bool:
    return tp_emis in DHCONT_XJUST_TP_EMIS


def uses_svc_endpoint(tp_emis: int) -> bool:
    """SVC-AN/RS: pass contingencia=True to ComunicacaoSefaz.autorizacao."""
    return tp_emis in SVC_TP_EMIS


def autorizacao_contingencia_flag(tp_emis: int) -> bool:
    """True when PyNFe must route the SOAP call to a contingency URL."""
    return is_contingencia(tp_emis)
