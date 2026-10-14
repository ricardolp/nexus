"""Código IBGE (7 dígitos) → código TOM/SIAFI da Receita Federal.

Sistemas municipais mais antigos (IPM/Atende.Net, entre outros) identificam
cidades pelo código TOM, não pelo IBGE. A tabela vem de
kelvins/municipios-brasileiros (coluna siafi_id), que coincide com o TOM
(ex.: Brusque 4202909 → 8055, exemplo da NTE 35/2021 da IPM; Garuva 4205803
→ 8115).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).parent / "data" / "ibge_tom.json"


@lru_cache(maxsize=1)
def _table() -> dict[str, str]:
    data = json.loads(_DATA.read_text(encoding="utf-8"))
    return data["ibge_tom"]


def ibge_to_tom(ibge: str) -> str:
    """Retorna o TOM ou "" quando o IBGE não está na tabela."""
    code = "".join(c for c in str(ibge or "") if c.isdigit())
    if len(code) != 7:
        return ""
    return _table().get(code, "")
