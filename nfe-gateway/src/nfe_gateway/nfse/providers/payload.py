"""Leitura do JSON canônico de NFS-e (contrato Focus/SAP) para os mappers.

Todos os mappers de provedor leem o payload por aqui, para que os aliases de
campo e as convenções numéricas sejam as mesmas em qualquer município.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation
from typing import Any


class PayloadError(ValueError):
    """Payload canônico incompleto ou inválido para o provedor."""


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def digits(value: Any) -> str:
    return "".join(ch for ch in text(value) if ch.isdigit())


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return text(value).lower() in {"true", "1", "x", "s", "sim", "yes"}


def present(value: Any) -> bool:
    return value is not None and text(value) != ""


def first(sources: list[Any], *keys: str) -> Any:
    """Primeiro valor presente entre as chaves, procurando em cada fonte."""
    for src in sources:
        if not isinstance(src, dict):
            continue
        for key in keys:
            if key in src and present(src.get(key)):
                return src.get(key)
    return None


def decimal(value: Any, *, field: str = "valor") -> Decimal:
    if not present(value):
        return Decimal(0)
    raw = value
    if isinstance(raw, str):
        raw = raw.strip()
        # "1.234,56" (pt-BR) e "1234.56" são aceitos.
        if "," in raw:
            raw = raw.replace(".", "").replace(",", ".")
    try:
        return Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise PayloadError(f"{field} deve ser numérico: {value!r}") from exc


def round2(value: Decimal) -> Decimal:
    """Arredondamento ABNT NBR 5891 (meio para o par)."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)


def percent_points(value: Any, *, field: str = "aliquota") -> Decimal:
    """0.05 e 5 significam 5%. Mesma regra do dps.py (pAliq)."""
    d = decimal(value, field=field)
    if abs(d) <= 1:
        return d * 100
    return d


def parse_emission(raw: Any) -> datetime:
    value = text(raw)
    if not value:
        raise PayloadError("data_emissao é obrigatória")
    candidate = value.replace("Z", "+00:00")
    for c in (candidate, candidate.replace("-0300", "-03:00")):
        try:
            return datetime.fromisoformat(c)
        except ValueError:
            continue
    try:
        d = date.fromisoformat(value[:10])
    except ValueError as exc:
        raise PayloadError(f"data_emissao inválida: {value}") from exc
    return datetime(d.year, d.month, d.day)


def prestador(payload: dict[str, Any]) -> dict[str, Any]:
    p = payload.get("prestador")
    return p if isinstance(p, dict) else {}


def tomador(payload: dict[str, Any]) -> dict[str, Any]:
    t = payload.get("tomador")
    return t if isinstance(t, dict) else {}


def servico(payload: dict[str, Any]) -> dict[str, Any]:
    s = payload.get("servico")
    return s if isinstance(s, dict) else {}


def endereco(pessoa: dict[str, Any]) -> dict[str, Any]:
    e = pessoa.get("endereco")
    return e if isinstance(e, dict) else {}


def prestador_municipio(payload: dict[str, Any]) -> str:
    return digits(prestador(payload).get("codigo_municipio") or servico(payload).get("codigo_municipio"))


def servico_municipio(payload: dict[str, Any]) -> str:
    return digits(servico(payload).get("codigo_municipio")) or prestador_municipio(payload)


def normalize_item_lista(item: Any, *, fmt: str) -> str:
    """Código do serviço (LC 116) no formato que o município espera.

    ``lc116``      → 4 dígitos (17.09 → 1709)
    ``nacional_6`` → 6 dígitos do código de tributação nacional (17.09 → 170901)
    """
    raw = digits(text(item).replace(".", ""))
    if not raw:
        raise PayloadError("servico.item_lista_servico é obrigatório")
    if fmt == "nacional_6":
        if len(raw) == 3:
            raw = "0" + raw
        if len(raw) == 4:
            raw += "01"
        if len(raw) != 6:
            raise PayloadError(f"item_lista_servico {item!r} não converte para 6 dígitos (cTribNac)")
        return raw
    if len(raw) == 6:
        raw = raw[:4]
    if len(raw) == 3:
        raw = "0" + raw
    if len(raw) != 4:
        raise PayloadError(f"item_lista_servico {item!r} não converte para o subitem LC 116 (4 dígitos)")
    return raw
