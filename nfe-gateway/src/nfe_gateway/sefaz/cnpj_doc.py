"""CNPJ / CPF normalization for NF-e (NT 2026.004 — CNPJ alfanumérico).

Schema pattern for CNPJ: ``[A-Z0-9]{12}[0-9]{2}`` (12 alfanuméricos + 2 DVs
numéricos). CNPJs antigos continuam válidos como 14 dígitos.

PyNFe ainda usa ``so_numeros()`` na serialização e remove letras — por isso o
valor normalizado precisa ser reaplicado no XML via ``xml_patches``.
"""

from __future__ import annotations

import re
from typing import Any

# NT 2026.004 / TCnpj atualizado
_CNPJ_RE = re.compile(r"^[A-Z0-9]{12}[0-9]{2}$")
_CPF_RE = re.compile(r"^[0-9]{11}$")


class CnpjDocError(ValueError):
    """Invalid CNPJ/CPF for NF-e."""


def normalize_cnpj(value: Any, *, field: str, required: bool = True) -> str:
    """Return a 14-char CNPJ (digits or alphanumeric). Never strip letters."""
    raw = str(value or "").strip()
    if not raw:
        if required:
            raise CnpjDocError(f"{field} é obrigatório (CNPJ com 14 caracteres).")
        return ""

    has_alpha = any(ch.isalpha() for ch in raw)
    if has_alpha:
        cleaned = "".join(ch for ch in raw.upper() if ch.isalnum())
        if not _CNPJ_RE.match(cleaned):
            raise CnpjDocError(
                f"{field} alfanumérico inválido: '{raw}' → '{cleaned}' "
                f"({len(cleaned)} caracteres; esperado 12 A-Z/0-9 + 2 dígitos)."
            )
        return cleaned

    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        if required:
            raise CnpjDocError(f"{field} é obrigatório (CNPJ com 14 caracteres).")
        return ""
    if len(digits) > 14:
        raise CnpjDocError(
            f"{field} inválido: '{digits}' ({len(digits)} dígitos). Informe CNPJ com 14 caracteres."
        )
    # SAP JSON number drops leading zeros on classic numeric CNPJ.
    cleaned = digits.zfill(14)
    if not _CNPJ_RE.match(cleaned):
        raise CnpjDocError(
            f"{field} inválido: '{raw}' → '{cleaned}'. Informe CNPJ com 14 caracteres."
        )
    return cleaned


def normalize_cpf(value: Any, *, field: str, required: bool = True) -> str:
    raw = str(value or "").strip()
    if not raw:
        if required:
            raise CnpjDocError(f"{field} é obrigatório (CPF com 11 dígitos).")
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        if required:
            raise CnpjDocError(f"{field} é obrigatório (CPF com 11 dígitos).")
        return ""
    if len(digits) > 11:
        raise CnpjDocError(
            f"{field} inválido: '{digits}' ({len(digits)} dígitos). Informe CPF com 11 dígitos."
        )
    cleaned = digits.zfill(11)
    if not _CPF_RE.match(cleaned):
        raise CnpjDocError(f"{field} inválido: '{raw}' → '{cleaned}'.")
    return cleaned


def is_alphanumeric_cnpj(value: Any) -> bool:
    raw = str(value or "")
    return any(ch.isalpha() for ch in raw)
