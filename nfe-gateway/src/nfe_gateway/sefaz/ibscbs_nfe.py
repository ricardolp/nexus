"""IBS/CBS da NF-e (Reforma Tributária, NT 2025.002-RTC v1.5x).

Monta ``det/imposto/IBSCBS`` (tipo TTribNFe) e ``total/IBSCBSTot`` (tipo
TIBSCBSMonoTot) a partir do JSON do SAP (contrato YNEX_IF_MSG_NFE), em vez de
usar a serialização do PyNFe — que escolhe o grupo por uma lista fixa de CSTs
(011/220/221/222/515/550/830 saíam sem valores, 400 saía com valores, 620 saía
como gIBSCBS) e não conhece gIBSCBSMono, gRed, gDif, gDevTrib, gTribRegular,
gTribCompraGov, gTransfCred, gAjusteCompet, gCredPresIBSZFM, gEstornoCred nem
gCredPresOper.

Quais grupos saem para cada CST vem de ``data/cst_ibscbs.json`` (espelho dos
indicadores da tabela oficial de CST/cClassTrib). Alíquotas são percentuais,
como no contrato SAP real (IBS_UF_ALIQUOTA = 0.1 → pIBSUF 0.1000).
"""

from __future__ import annotations

import json
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path
from typing import Any

from lxml import etree

NFE_NS = "http://www.portalfiscal.inf.br/nfe"
_TABLE_PATH = Path(__file__).parent / "data" / "cst_ibscbs.json"

_CENT = Decimal("0.01")
_RATE = Decimal("0.0001")
_QTY = Decimal("0.0001")
_ZERO = Decimal("0")
_HUNDRED = Decimal("100")
# R$ 0,01 de tolerância entre vBC × alíquota e o valor informado.
_TOLERANCE = Decimal("0.01")

_MAIN_GROUPS = ("gIBSCBS", "gIBSCBSMono", "gTransfCred", "gAjusteCompet")


class IbsCbsMapperError(ValueError):
    """Dados de IBS/CBS do SAP incompatíveis com o CST/cClassTrib informado."""


# --------------------------------------------------------------------------- #
# Tabela CST → grupos
# --------------------------------------------------------------------------- #


@lru_cache(maxsize=1)
def _table() -> dict[str, Any]:
    return json.loads(_TABLE_PATH.read_text(encoding="utf-8"))


def groups_for(cst: str, c_class_trib: str) -> dict[str, str]:
    """Return {group: 'obrigatorio'|'opcional'} for a CST / cClassTrib."""
    table = _table()
    rule = dict(table.get("por_cst", {}).get(cst) or {})
    rule.update(table.get("por_cclasstrib", {}).get(c_class_trib) or {})
    if cst not in table.get("por_cst", {}) and c_class_trib not in table.get("por_cclasstrib", {}):
        raise IbsCbsMapperError(f"CST de IBS/CBS {cst} desconhecido (tabela CST/cClassTrib).")
    out = {k: v for k, v in rule.items() if k.startswith("g") and v in ("obrigatorio", "opcional")}
    if out.get("gIBSCBS"):
        for g in table.get("opcionais_com_gIBSCBS", []):
            out.setdefault(g, "opcional")
    for g in table.get("opcionais_qualquer_cst", []):
        out.setdefault(g, "opcional")
    return out


# --------------------------------------------------------------------------- #
# Leitura do JSON SAP
# --------------------------------------------------------------------------- #


def _raw(d: dict, *keys: str) -> Any:
    lowered = None
    for key in keys:
        if key in d:
            return d[key]
        if lowered is None:
            lowered = {str(k).lower(): v for k, v in d.items()}
        if key.lower() in lowered:
            return lowered[key.lower()]
    return None


def _txt(d: dict, *keys: str) -> str:
    for key in keys:
        v = _raw(d, key)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return ""


def _dec(d: dict, *keys: str) -> Decimal | None:
    """First non-zero value among keys; else 0 if any key was sent; else None.

    The ABAP contract sends every field, unused ones as 0 — so a fallback
    chain must skip zeros instead of stopping at the first key present.
    """
    first_zero: Decimal | None = None
    for key in keys:
        v = _raw(d, key)
        if v is None:
            continue
        text = str(v).strip().replace(",", ".")
        if text == "":
            continue
        try:
            value = Decimal(text)
        except InvalidOperation as exc:
            raise IbsCbsMapperError(f"valor numérico inválido em {key}: {v!r}") from exc
        if value != 0:
            return value
        if first_zero is None:
            first_zero = value
    return first_zero


def _nz(v: Decimal | None) -> bool:
    return v is not None and v != 0


def _digits(v: Any) -> str:
    return "".join(ch for ch in str(v or "") if ch.isdigit())


# --------------------------------------------------------------------------- #
# Formatação (DFeTiposBasicos)
# --------------------------------------------------------------------------- #


def _f2(v: Decimal, field: str) -> str:
    if v < 0:
        raise IbsCbsMapperError(f"{field} não pode ser negativo ({v}).")
    return f"{v.quantize(_CENT, rounding=ROUND_HALF_UP):.2f}"


def _f4(v: Decimal, field: str) -> str:
    if v < 0:
        raise IbsCbsMapperError(f"{field} não pode ser negativo ({v}).")
    if v > _HUNDRED:
        raise IbsCbsMapperError(f"{field} é um percentual e não pode passar de 100 ({v}).")
    return f"{v.quantize(_RATE, rounding=ROUND_HALF_UP):.4f}"


def _q4(v: Decimal, field: str) -> str:
    if v < 0:
        raise IbsCbsMapperError(f"{field} não pode ser negativo ({v}).")
    return f"{v.quantize(_QTY, rounding=ROUND_HALF_UP):.4f}"


def _sub(parent: etree._Element, tag: str, text: str | None = None) -> etree._Element:
    ns = etree.QName(parent).namespace or NFE_NS
    el = etree.SubElement(parent, f"{{{ns}}}{tag}")
    if text is not None:
        el.text = text
    return el


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _child(parent: etree._Element | None, name: str) -> etree._Element | None:
    if parent is None:
        return None
    for c in parent:
        if isinstance(c.tag, str) and _local(c) == name:
            return c
    return None


def _ctext(parent: etree._Element | None, *path: str) -> str:
    node = parent
    for name in path:
        node = _child(node, name)
        if node is None:
            return ""
    return (node.text or "").strip()


def _competencia(raw: str, field: str) -> str:
    """'2026-10', '2026-10-01', '202610', '20261001' → '2026-10' (xs:gYearMonth)."""
    digits = _digits(raw)
    if len(digits) >= 6:
        year, month = digits[:4], digits[4:6]
        if "01" <= month <= "12":
            return f"{year}-{month}"
    raise IbsCbsMapperError(f"{field} deve ser uma competência AAAA-MM; recebido {raw!r}.")


# --------------------------------------------------------------------------- #
# Item
# --------------------------------------------------------------------------- #


class _Ente:
    """Uma esfera do IBS/CBS no gIBSCBS: UF, Mun ou CBS."""

    def __init__(self, tag: str, p_tag: str, v_tag: str, p_keys: tuple[str, ...], v_keys: tuple[str, ...],
                 red_keys: tuple[str, ...], efet_keys: tuple[str, ...], dif_p_keys: tuple[str, ...],
                 dif_v_keys: tuple[str, ...], dev_p_keys: tuple[str, ...], dev_v_keys: tuple[str, ...]):
        self.tag, self.p_tag, self.v_tag = tag, p_tag, v_tag
        self.p_keys, self.v_keys = p_keys, v_keys
        self.red_keys, self.efet_keys = red_keys, efet_keys
        self.dif_p_keys, self.dif_v_keys = dif_p_keys, dif_v_keys
        self.dev_p_keys, self.dev_v_keys = dev_p_keys, dev_v_keys


_UF = _Ente(
    "gIBSUF", "pIBSUF", "vIBSUF",
    ("ibs_aliquota_uf", "ibs_uf_aliquota", "ibs_aliquota"), ("ibs_valor_uf", "ibs_uf_valor"),
    ("ibs_uf_percentual_reducao_aliq", "ibs_uf_percentual_reducao", "ibs_cbs_percentual_reducao"),
    ("ibs_uf_aliquota_efetiva",),
    ("ibs_uf_percentual_diferimento", "ibs_cbs_percentual_diferimento"), ("ibs_uf_valor_diferido",),
    ("ibs_uf_percentual_devolvido",), ("ibs_uf_valor_tributo_devolvido", "ibs_uf_valor_devolvido"),
)
_MUN = _Ente(
    "gIBSMun", "pIBSMun", "vIBSMun",
    ("ibs_aliquota_mun", "ibs_mun_aliquota"), ("ibs_valor_mun", "ibs_mun_valor"),
    ("ibs_mun_percentual_reduc_aliq", "ibs_mun_percentual_reducao", "ibs_cbs_percentual_reducao"),
    ("ibs_mun_aliquota_efetiva",),
    ("ibs_mun_percentual_diferimento", "ibs_cbs_percentual_diferimento"), ("ibs_mun_valor_diferido",),
    ("ibs_mun_percentual_devolvido",), ("ibs_mun_valor_tributo_devolv", "ibs_mun_valor_devolvido"),
)
_CBS = _Ente(
    "gCBS", "pCBS", "vCBS",
    ("cbs_aliquota",), ("cbs_valor",),
    ("cbs_percentual_reducao_aliq", "cbs_percentual_reducao", "ibs_cbs_percentual_reducao"),
    ("cbs_aliquota_efetiva",),
    ("cbs_percentual_diferimento", "ibs_cbs_percentual_diferimento"), ("cbs_valor_diferido",),
    ("cbs_percentual_devolvido",), ("cbs_valor_tributo_devolvido", "cbs_valor_devolvido"),
)

_VBC_KEYS = ("ibs_base", "cbs_base", "ibs_cbs_base_calculo")


def item_label(item: dict) -> str:
    n = _txt(item, "numero_item", "nitem")
    if n:
        return f"Item {n}"
    code = _txt(item, "codigo_produto")
    return f"Item {code}" if code else "Item"


def item_classification(item: dict) -> tuple[str, str]:
    cst = _digits(_txt(item, "ibs_cst", "cbs_cst", "ibs_cbs_situacao_tributaria"))
    cclass = _digits(_txt(
        item, "ibs_c_class_trib", "cbs_c_class_trib", "ibs_cbs_classificacao_tribut",
        "ibs_cbs_classificacao_tributaria",
    ))
    return cst, cclass


def _effective_rate(p: Decimal, red: Decimal | None, efet: Decimal | None) -> Decimal:
    if _nz(efet):
        return efet  # type: ignore[return-value]
    if red is None:
        return p
    return (p * (_HUNDRED - red) / _HUNDRED).quantize(_RATE, rounding=ROUND_HALF_UP)


def _build_ente(g: etree._Element, ente: _Ente, item: dict, vbc: Decimal, groups: dict[str, str],
                label: str, *, check: bool) -> dict[str, Decimal]:
    """One of gIBSUF / gIBSMun / gCBS. Returns amounts for the totals."""
    p = _dec(item, *ente.p_keys)
    v = _dec(item, *ente.v_keys)
    if p is None or v is None:
        raise IbsCbsMapperError(
            f"{label}: {ente.tag} exige alíquota ({ente.p_keys[0]}) e valor ({ente.v_keys[0]})."
        )
    red = _dec(item, *ente.red_keys)
    efet = _dec(item, *ente.efet_keys)
    p_dif = _dec(item, *ente.dif_p_keys)
    v_dif = _dec(item, *ente.dif_v_keys)
    p_dev = _dec(item, *ente.dev_p_keys)
    v_dev = _dec(item, *ente.dev_v_keys)

    want_red = groups.get("gRed") == "obrigatorio" or (groups.get("gRed") == "opcional" and _nz(red))
    want_dif = groups.get("gDif") == "obrigatorio" or (groups.get("gDif") == "opcional" and _nz(p_dif))
    want_dev = groups.get("gDevTrib") is not None and _nz(v_dev)

    rate = _effective_rate(p, red, efet) if want_red else p

    grp = _sub(g, ente.tag)
    _sub(grp, ente.p_tag, _f4(p, ente.p_tag))
    if want_dif:
        if p_dif is None:
            raise IbsCbsMapperError(f"{label}: CST com diferimento exige {ente.dif_p_keys[0]} (pDif).")
        if not _nz(v_dif):
            v_dif = (vbc * rate / _HUNDRED * p_dif / _HUNDRED).quantize(_CENT, rounding=ROUND_HALF_UP)
        gdif = _sub(grp, "gDif")
        _sub(gdif, "pDif", _f4(p_dif, "pDif"))
        _sub(gdif, "vDif", _f2(v_dif, "vDif"))
    else:
        v_dif = None
    if want_dev:
        gdev = _sub(grp, "gDevTrib")
        if _nz(p_dev):
            _sub(gdev, "pDevTrib", _f4(p_dev, "pDevTrib"))
        _sub(gdev, "vDevTrib", _f2(v_dev, "vDevTrib"))  # type: ignore[arg-type]
    else:
        v_dev = None
    if want_red:
        if red is None and not _nz(efet):
            raise IbsCbsMapperError(
                f"{label}: CST com redução de alíquota exige {ente.red_keys[0]} (pRedAliq)."
            )
        gred = _sub(grp, "gRed")
        _sub(gred, "pRedAliq", _f4(red if red is not None else _ZERO, "pRedAliq"))
        _sub(gred, "pAliqEfet", _f4(rate, "pAliqEfet"))
    _sub(grp, ente.v_tag, _f2(v, ente.v_tag))

    if check and not want_dif and not want_dev:
        expected = (vbc * rate / _HUNDRED).quantize(_CENT, rounding=ROUND_HALF_UP)
        if abs(expected - v) > _TOLERANCE:
            hint = ""
            if vbc and abs((vbc * rate).quantize(_CENT, rounding=ROUND_HALF_UP) - v) <= _TOLERANCE:
                hint = (f" A alíquota parece estar em fração ({rate}); o leiaute usa percentual "
                        f"(ex.: 0,1% = 0.10).")
            raise IbsCbsMapperError(
                f"{label}: {ente.v_tag} {v} não confere com vBC {vbc} × {ente.p_tag} {rate}% = {expected}.{hint}"
            )
    return {"v": v, "dif": v_dif or _ZERO, "dev": v_dev or _ZERO}


def _build_gibscbs(parent: etree._Element, item: dict, groups: dict[str, str], label: str,
                   *, cst: str, compra_gov: bool) -> dict[str, Decimal]:
    vbc = _dec(item, *_VBC_KEYS)
    if vbc is None:
        raise IbsCbsMapperError(f"{label}: gIBSCBS exige a base de cálculo (ibs_cbs_base_calculo).")
    check = cst not in ("220", "221") and not compra_gov
    g = _sub(parent, "gIBSCBS")
    _sub(g, "vBC", _f2(vbc, "vBC"))
    uf = _build_ente(g, _UF, item, vbc, groups, label, check=check)
    mun = _build_ente(g, _MUN, item, vbc, groups, label, check=check)
    v_ibs = _dec(item, "ibs_valor", "ibs_valor_total")
    if v_ibs is None:
        v_ibs = uf["v"] + mun["v"]
    if abs(v_ibs - (uf["v"] + mun["v"])) > _TOLERANCE:
        raise IbsCbsMapperError(
            f"{label}: vIBS {v_ibs} deve ser vIBSUF {uf['v']} + vIBSMun {mun['v']}."
        )
    v_ibs = uf["v"] + mun["v"]
    # gIBSUF, gIBSMun and vIBS come before gCBS (XSD sequence).
    _sub(g, "vIBS", _f2(v_ibs, "vIBS"))
    cbs = _build_ente(g, _CBS, item, vbc, groups, label, check=check)
    # gCBS was appended after vIBS — keep XSD order gIBSUF, gIBSMun, vIBS, gCBS.

    if groups.get("gTribRegular"):
        cst_reg = _digits(_txt(item, "ibs_cbs_situacao_tribut_reg", "ibs_cbs_cst_regular"))
        if cst_reg:
            class_reg = _digits(_txt(item, "ibs_cbs_classific_tribut_reg", "ibs_cbs_c_class_trib_regular"))
            if len(cst_reg) != 3 or len(class_reg) != 6:
                raise IbsCbsMapperError(f"{label}: gTribRegular exige CST (3) e cClassTrib (6) regulares.")
            reg = _sub(g, "gTribRegular")
            _sub(reg, "CSTReg", cst_reg)
            _sub(reg, "cClassTribReg", class_reg)
            for tag, keys, fmt in (
                ("pAliqEfetRegIBSUF", ("ibs_aliquota_efetiva_reg_uf",), _f4),
                ("vTribRegIBSUF", ("ibs_valor_tributo_regular_uf",), _f2),
                ("pAliqEfetRegIBSMun", ("ibs_aliquota_efetiva_reg_mun",), _f4),
                ("vTribRegIBSMun", ("ibs_valor_tributo_regular_mun",), _f2),
                ("pAliqEfetRegCBS", ("cbs_aliquota_efetiva_regular",), _f4),
                ("vTribRegCBS", ("cbs_valor_tributo_regular",), _f2),
            ):
                _sub(reg, tag, fmt(_dec(item, *keys) or _ZERO, tag))

    if compra_gov and groups.get("gTribCompraGov"):
        vals = [
            ("pAliqIBSUF", ("ibs_aliquota_competencia_uf", "ibs_aliquota_compra_gov_uf"), _f4),
            ("vTribIBSUF", ("ibs_valor_tributo_calculado_uf",), _f2),
            ("pAliqIBSMun", ("ibs_aliquota_compet_mun", "ibs_aliquota_compra_gov_mun"), _f4),
            ("vTribIBSMun", ("ibs_valor_tributo_calc_mun",), _f2),
            ("pAliqCBS", ("cbs_aliquota_compra_governamen", "cbs_aliquota_compra_gov"), _f4),
            ("vTribCBS", ("cbs_valor_tributo_calculado",), _f2),
        ]
        if any(_nz(_dec(item, *keys)) for _tag, keys, _fmt in vals):
            gov = _sub(g, "gTribCompraGov")
            for tag, keys, fmt in vals:
                _sub(gov, tag, fmt(_dec(item, *keys) or _ZERO, tag))

    return {
        "vbc": vbc,
        "v_ibs_uf": uf["v"], "v_dif_uf": uf["dif"], "v_dev_uf": uf["dev"],
        "v_ibs_mun": mun["v"], "v_dif_mun": mun["dif"], "v_dev_mun": mun["dev"],
        "v_ibs": v_ibs,
        "v_cbs": cbs["v"], "v_dif_cbs": cbs["dif"], "v_dev_cbs": cbs["dev"],
    }


def _reorder_gibscbs(g: etree._Element) -> None:
    order = ("vBC", "gIBSUF", "gIBSMun", "vIBS", "gCBS", "gTribRegular", "gTribCompraGov")
    children = {_local(c): c for c in g}
    for c in list(g):
        g.remove(c)
    for name in order:
        if name in children:
            g.append(children[name])


# --------------------------- monofásico (CST 620) --------------------------- #


def mono_regime(year: int) -> tuple[str, str]:
    """(IBS, CBS) regime by emission year — RV UB85a-10 (NT 2025.002 v1.50).

    2026: Ad Valorem / Ad Valorem; 2027–2028: Ad Valorem / Ad Rem;
    2029+: Ad Rem / Ad Rem. Informar Ad Rem antes do previsto é rejeitado.
    """
    ibs = "AdRem" if year >= 2029 else "AdValorem"
    cbs = "AdRem" if year >= 2027 else "AdValorem"
    return ibs, cbs


def _build_mono_tributo(parent: etree._Element, item: dict, *, tributo: str, regime: str,
                        c_class: str, label: str) -> dict[str, Decimal]:
    """gIBSMonoAdRem / gIBSMonoAdValorem / gCBSMonoAdRem / gCBSMonoAdValorem."""
    t = tributo.lower()  # ibs | cbs
    T = tributo.upper()
    out = {"mono": _ZERO, "reten": _ZERO, "ret": _ZERO, "dif_bio": _ZERO}
    grp = etree.Element(f"{{{NFE_NS}}}g{T}Mono{regime}")
    if regime == "AdRem":
        q = _dec(item, "mono_base_calculo_quantidade_t", "ibscbs_q_bc_mono")
        ad_rem = _dec(item, f"mono_{t}_aliquota_ad_rem", f"ibscbs_ad_rem_{t}")
        v = _dec(item, f"mono_{t}_valor", f"ibscbs_v_{t}_mono")
        if _nz(q) or _nz(v):
            if q is None or ad_rem is None or v is None:
                raise IbsCbsMapperError(f"{label}: g{T}Mono{regime} exige quantidade, ad rem e valor.")
            pad = _sub(grp, "gMonoPadrao")
            _sub(pad, "qBCMono", _q4(q, "qBCMono"))
            _sub(pad, f"adRem{T}", _f4(ad_rem, f"adRem{T}"))
            _sub(pad, f"v{T}Mono", _f2(v, f"v{T}Mono"))
            out["mono"] = v
        q_r = _dec(item, "mono_base_calculo_qtd_trib_ret")
        ad_r = _dec(item, f"mono_{t}_aliquota_retencao")
        v_r = _dec(item, f"mono_{t}_valor_retencao")
        if _nz(v_r):
            if q_r is None or ad_r is None:
                raise IbsCbsMapperError(f"{label}: gMonoReten exige quantidade e ad rem de retenção.")
            ret = _sub(grp, "gMonoReten")
            _sub(ret, "qBCMonoReten", _q4(q_r, "qBCMonoReten"))
            _sub(ret, f"adRem{T}Reten", _f4(ad_r, f"adRem{T}Reten"))
            _sub(ret, f"v{T}MonoReten", _f2(v_r, f"v{T}MonoReten"))
            out["reten"] = v_r
    else:
        vbc = _dec(item, "mono_base_calculo_valor", "ibs_base", "cbs_base", "ibs_cbs_base_calculo")
        if t == "ibs":
            p_uf = _dec(item, "mono_ibs_uf_aliquota", "ibs_aliquota_uf", "ibs_uf_aliquota")
            v_uf = _dec(item, "mono_ibs_uf_valor", "ibs_valor_uf", "ibs_uf_valor")
            p_mun = _dec(item, "mono_ibs_mun_aliquota", "ibs_aliquota_mun", "ibs_mun_aliquota")
            v_mun = _dec(item, "mono_ibs_mun_valor", "ibs_valor_mun", "ibs_mun_valor")
            v = _dec(item, "mono_ibs_valor")
            if not _nz(v):
                v = (v_uf or _ZERO) + (v_mun or _ZERO)
            if _nz(v):
                if vbc is None or p_uf is None or v_uf is None:
                    raise IbsCbsMapperError(
                        f"{label}: gIBSMonoAdValorem exige base (mono_base_calculo_valor), "
                        "alíquota e valor do IBS UF."
                    )
                pad = _sub(grp, "gMonoPadrao")
                _sub(pad, "vBCMono", _f2(vbc, "vBCMono"))
                _sub(pad, "pAliqMonoUF", _f4(p_uf, "pAliqMonoUF"))
                _sub(pad, "vIBSMonoUF", _f2(v_uf, "vIBSMonoUF"))
                _sub(pad, "pAliqMonoMun", _f4(p_mun or _ZERO, "pAliqMonoMun"))
                _sub(pad, "vIBSMonoMun", _f2(v_mun or _ZERO, "vIBSMonoMun"))
                _sub(pad, "vIBSMono", _f2(v, "vIBSMono"))
                out["mono"] = v
        else:
            p = _dec(item, "mono_cbs_aliquota", "cbs_aliquota")
            v = _dec(item, "mono_cbs_valor", "cbs_valor")
            if _nz(v):
                if vbc is None or p is None:
                    raise IbsCbsMapperError(
                        f"{label}: gCBSMonoAdValorem exige base (mono_base_calculo_valor) e alíquota da CBS."
                    )
                pad = _sub(grp, "gMonoPadrao")
                _sub(pad, "vBCMono", _f2(vbc, "vBCMono"))
                _sub(pad, "pAliqMonoCBS", _f4(p, "pAliqMonoCBS"))
                _sub(pad, "vCBSMono", _f2(v, "vCBSMono"))
                out["mono"] = v
        vbc_r = _dec(item, "mono_base_calculo_valor_reten")
        p_r = _dec(item, f"mono_{t}_aliquota_retencao")
        v_r = _dec(item, f"mono_{t}_valor_retencao")
        if _nz(v_r):
            if vbc_r is None or p_r is None:
                raise IbsCbsMapperError(
                    f"{label}: gMonoReten Ad Valorem exige mono_base_calculo_valor_reten e alíquota de retenção."
                )
            ret = _sub(grp, "gMonoReten")
            _sub(ret, "vBCMonoReten", _f2(vbc_r, "vBCMonoReten"))
            _sub(ret, "pAliqMonoReten", _f4(p_r, "pAliqMonoReten"))
            _sub(ret, f"v{T}MonoReten", _f2(v_r, f"v{T}MonoReten"))
            out["reten"] = v_r

    v_ret = _dec(item, f"mono_{t}_valor_retido_ante", f"mono_{t}_valor_retido")
    if _nz(v_ret):
        _sub(_sub(grp, "gMonoRet"), f"v{T}MonoRet", _f2(v_ret, f"v{T}MonoRet"))
        out["ret"] = v_ret

    q_bio = _dec(item, "mono_quantidade_bio_comb", "mono_qbc_bio_comb")
    v_bio = _dec(item, f"mono_{t}_valor_diferenca")
    if c_class in ("620004", "620005") or _nz(v_bio):
        if q_bio is None or v_bio is None:
            raise IbsCbsMapperError(
                f"{label}: cClassTrib {c_class} (diferença de biocombustível) exige "
                f"mono_quantidade_bio_comb e mono_{t}_valor_diferenca."
            )
        bio = _sub(grp, "gpBioDiferenca")
        _sub(bio, "qBCBioComb", _q4(q_bio, "qBCBioComb"))
        _sub(bio, f"v{T}Diferenca", _f2(v_bio, f"v{T}Diferenca"))
        out["dif_bio"] = v_bio

    if len(grp):
        parent.append(grp)
    return out


def _build_mono(parent: etree._Element, item: dict, *, year: int, c_class: str, label: str) -> dict[str, Decimal]:
    ibs_regime, cbs_regime = mono_regime(year)
    g = _sub(parent, "gIBSCBSMono")
    ibs = _build_mono_tributo(g, item, tributo="ibs", regime=ibs_regime, c_class=c_class, label=label)
    cbs = _build_mono_tributo(g, item, tributo="cbs", regime=cbs_regime, c_class=c_class, label=label)
    if not len(g):
        raise IbsCbsMapperError(
            f"{label}: CST 620 (monofásica) sem valores. Em {year} o IBS é {ibs_regime} e a CBS é "
            f"{cbs_regime}; informe base/alíquota/valor (Ad Valorem) ou quantidade/ad rem/valor (Ad Rem)."
        )
    tot_ibs = _dec(item, "mono_total_ibs_item")
    tot_cbs = _dec(item, "mono_total_cbs_item")
    if not _nz(tot_ibs):
        tot_ibs = ibs["mono"] + ibs["reten"]
    if not _nz(tot_cbs):
        tot_cbs = cbs["mono"] + cbs["reten"]
    _sub(g, "vTotIBSMonoItem", _f2(tot_ibs, "vTotIBSMonoItem"))
    _sub(g, "vTotCBSMonoItem", _f2(tot_cbs, "vTotCBSMonoItem"))
    return {
        "v_ibs_mono": ibs["mono"], "v_cbs_mono": cbs["mono"],
        "v_ibs_mono_reten": ibs["reten"], "v_cbs_mono_reten": cbs["reten"],
        "v_ibs_mono_ret": ibs["ret"], "v_cbs_mono_ret": cbs["ret"],
    }


# ------------------------------- outros grupos ------------------------------ #


def _build_cred_pres_oper(parent: etree._Element, item: dict, label: str) -> dict[str, Decimal]:
    code = _digits(_txt(item, "credito_presumido_oper_codigo", "ibs_credito_codigo_classific",
                        "cbs_credito_codigo_classific"))
    vbc = _dec(item, "credito_presumido_oper_base_ca", "credito_presumido_oper_base_calculo")
    sums = {"ibs": _ZERO, "ibs_sus": _ZERO, "cbs": _ZERO, "cbs_sus": _ZERO}
    parts = []
    for t, T in (("ibs", "IBS"), ("cbs", "CBS")):
        p = _dec(item, f"{t}_credito_percentual")
        v = _dec(item, f"{t}_valor_credito_presumido")
        v_sus = _dec(item, f"{t}_valor_condicao_suspensiva")
        if _nz(v) or _nz(v_sus):
            parts.append((T, t, p or _ZERO, v, v_sus))
    if not parts:
        return sums
    if not code or vbc is None:
        raise IbsCbsMapperError(
            f"{label}: crédito presumido exige credito_presumido_oper_codigo (cCredPres) e base."
        )
    g = _sub(parent, "gCredPresOper")
    _sub(g, "vBCCredPres", _f2(vbc, "vBCCredPres"))
    _sub(g, "cCredPres", code.zfill(2)[-2:])
    for T, t, p, v, v_sus in parts:
        gc = _sub(g, f"g{T}CredPres")
        _sub(gc, "pCredPres", _f4(p, "pCredPres"))
        # TCredPres: choice vCredPres | vCredPresCondSus.
        if _nz(v_sus):
            _sub(gc, "vCredPresCondSus", _f2(v_sus, "vCredPresCondSus"))  # type: ignore[arg-type]
            sums[f"{t}_sus"] = v_sus  # type: ignore[assignment]
        else:
            _sub(gc, "vCredPres", _f2(v, "vCredPres"))  # type: ignore[arg-type]
            sums[t] = v  # type: ignore[assignment]
    return sums


def build_item_ibscbs(item: dict, *, year: int, compra_gov: bool = False) -> tuple[etree._Element | None, dict]:
    """Build <IBSCBS> for one SAP item. Returns (element or None, totals)."""
    label = item_label(item)
    cst, c_class = item_classification(item)
    if not cst and not c_class:
        return None, {}
    if not cst or not c_class:
        raise IbsCbsMapperError(
            f"{label}: informe CST (ibs_cbs_situacao_tributaria) e cClassTrib "
            "(ibs_cbs_classificacao_tribut) do IBS/CBS juntos."
        )
    if len(cst) > 3 or len(c_class) > 6:
        raise IbsCbsMapperError(f"{label}: CST {cst!r} / cClassTrib {c_class!r} com tamanho inválido.")
    cst, c_class = cst.zfill(3), c_class.zfill(6)
    if not c_class.startswith(cst):
        raise IbsCbsMapperError(
            f"{label}: cClassTrib {c_class} não pertence ao CST {cst} (os 3 primeiros dígitos são o CST)."
        )
    groups = groups_for(cst, c_class)

    root = etree.Element(f"{{{NFE_NS}}}IBSCBS")
    _sub(root, "CST", cst)
    _sub(root, "cClassTrib", c_class)
    if _txt(item, "ibs_cbs_indicacao_doacao", "indicador_doacao") in ("1", "S", "X", "true", "True"):
        _sub(root, "indDoacao", "1")

    totals: dict[str, Decimal] = {}
    main = [g for g in _MAIN_GROUPS if groups.get(g)]
    if len(main) > 1:
        raise IbsCbsMapperError(f"{label}: tabela CST {cst} indica mais de um grupo principal: {main}.")
    if main:
        g = main[0]
        mandatory = groups[g] == "obrigatorio"
        if g == "gIBSCBS":
            has_data = any(_nz(_dec(item, *keys)) for keys in (
                _VBC_KEYS, _UF.v_keys, _MUN.v_keys, _CBS.v_keys))
            if mandatory or has_data:
                totals.update(_build_gibscbs(root, item, groups, label, cst=cst, compra_gov=compra_gov))
                _reorder_gibscbs(_child(root, "gIBSCBS"))  # type: ignore[arg-type]
        elif g == "gIBSCBSMono":
            totals.update(_build_mono(root, item, year=year, c_class=c_class, label=label))
        elif g == "gTransfCred":
            v_ibs = _dec(item, "ibs_valor_transferido")
            v_cbs = _dec(item, "cbs_valor_transferido")
            if v_ibs is None and v_cbs is None:
                raise IbsCbsMapperError(f"{label}: CST 800 exige ibs_valor_transferido / cbs_valor_transferido.")
            tc = _sub(root, "gTransfCred")
            _sub(tc, "vIBS", _f2(v_ibs or _ZERO, "vIBS"))
            _sub(tc, "vCBS", _f2(v_cbs or _ZERO, "vCBS"))
        elif g == "gAjusteCompet":
            compet = _txt(item, "data_competencia_apuracao", "competencia_apuracao")
            if not compet:
                raise IbsCbsMapperError(f"{label}: CST 811 exige data_competencia_apuracao (competApur).")
            aj = _sub(root, "gAjusteCompet")
            _sub(aj, "competApur", _competencia(compet, "data_competencia_apuracao"))
            _sub(aj, "vIBS", _f2(_dec(item, "ibs_valor_ajuste_competencia") or _ZERO, "vIBS"))
            _sub(aj, "vCBS", _f2(_dec(item, "cbs_valor_ajuste_competencia") or _ZERO, "vCBS"))

    if groups.get("gEstornoCred"):
        v_ibs = _dec(item, "ibs_valor_estorno_credito")
        v_cbs = _dec(item, "cbs_valor_estorno_credito")
        if _nz(v_ibs) or _nz(v_cbs):
            est = _sub(root, "gEstornoCred")
            _sub(est, "vIBSEstCred", _f2(v_ibs or _ZERO, "vIBSEstCred"))
            _sub(est, "vCBSEstCred", _f2(v_cbs or _ZERO, "vCBSEstCred"))
            totals["v_ibs_est"] = v_ibs or _ZERO
            totals["v_cbs_est"] = v_cbs or _ZERO

    if groups.get("gCredPresIBSZFM"):
        compet = _txt(item, "credito_presumido_zfm_competen", "data_competencia_apuracao")
        tipo = _digits(_txt(item, "credito_presumido_zfm_classifi", "tipo_credito_presumido_ibs_zfm"))
        valor = _dec(item, "credito_presumido_zfm_valor")
        if groups["gCredPresIBSZFM"] == "obrigatorio" or _nz(valor):
            if not compet or not tipo or valor is None:
                raise IbsCbsMapperError(
                    f"{label}: gCredPresIBSZFM exige competência, tipo (0–4) e valor do crédito presumido ZFM."
                )
            if tipo not in ("0", "1", "2", "3", "4"):
                raise IbsCbsMapperError(f"{label}: tpCredPresIBSZFM deve ser 0 a 4 (recebido {tipo}).")
            z = _sub(root, "gCredPresIBSZFM")
            _sub(z, "competApur", _competencia(compet, "credito_presumido_zfm_competen"))
            _sub(z, "tpCredPresIBSZFM", tipo)
            _sub(z, "vCredPresIBSZFM", _f2(valor, "vCredPresIBSZFM"))
    elif groups.get("gCredPresOper"):
        cp = _build_cred_pres_oper(root, item, label)
        if any(cp.values()):
            totals["v_ibs_cred_pres"] = cp["ibs"]
            totals["v_ibs_cred_pres_sus"] = cp["ibs_sus"]
            totals["v_cbs_cred_pres"] = cp["cbs"]
            totals["v_cbs_cred_pres_sus"] = cp["cbs_sus"]

    return root, totals


# --------------------------------------------------------------------------- #
# NF-e inteira
# --------------------------------------------------------------------------- #


def _emission_year(xml: etree._Element) -> int:
    for el in xml.iter():
        if isinstance(el.tag, str) and _local(el) == "dhEmi" and el.text:
            try:
                return int(el.text.strip()[:4])
            except ValueError:
                break
    return date.today().year


def apply_ibscbs_nfe(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Replace every det/imposto/IBSCBS and total/IBSCBSTot from the SAP items."""
    inf = next((el for el in xml.iter() if isinstance(el.tag, str) and _local(el) == "infNFe"), None)
    if inf is None:
        return
    items = [i for i in (sap.get("items") or sap.get("ITEMS") or []) if isinstance(i, dict)]
    dets = [c for c in inf if isinstance(c.tag, str) and _local(c) == "det"]
    year = _emission_year(xml)
    ide = _child(inf, "ide")
    compra_gov = _child(ide, "gCompraGov") is not None

    for idx, det in enumerate(dets):
        imposto = _child(det, "imposto")
        if imposto is None:
            continue
        for old in [c for c in imposto if isinstance(c.tag, str) and _local(c) == "IBSCBS"]:
            imposto.remove(old)
        item = items[idx] if idx < len(items) else {}
        el, _tot = build_item_ibscbs(item, year=year, compra_gov=compra_gov)
        if el is not None:
            imposto.append(el)  # IBSCBS is the last child of <imposto>
    rebuild_ibscbs_tot(xml)


def _sum(nodes: list[etree._Element], *path: str) -> Decimal:
    total = _ZERO
    for n in nodes:
        text = _ctext(n, *path)
        if text:
            total += Decimal(text)
    return total


def rebuild_ibscbs_tot(xml: etree._Element) -> None:
    """total/IBSCBSTot = soma dos itens (TIBSCBSMonoTot). Sem IBSCBS nos itens, remove."""
    inf = next((el for el in xml.iter() if isinstance(el.tag, str) and _local(el) == "infNFe"), None)
    total = _child(inf, "total") if inf is not None else None
    if total is None:
        total = next((el for el in xml.iter() if isinstance(el.tag, str) and _local(el) == "total"), None)
    if total is None:
        return
    item_groups = [
        el for el in xml.iter()
        if isinstance(el.tag, str) and _local(el) == "IBSCBS"
        and el.getparent() is not None and _local(el.getparent()) == "imposto"
    ]
    existing = [c for c in total if isinstance(c.tag, str) and _local(c) == "IBSCBSTot"]
    for extra in existing[1:]:
        total.remove(extra)
    if not item_groups:
        for el in existing[:1]:
            total.remove(el)
        return

    gs = [g for g in (_child(i, "gIBSCBS") for i in item_groups) if g is not None]
    monos = [g for g in (_child(i, "gIBSCBSMono") for i in item_groups) if g is not None]
    ests = [g for g in (_child(i, "gEstornoCred") for i in item_groups) if g is not None]
    creds = [g for g in (_child(i, "gCredPresOper") for i in item_groups) if g is not None]

    if existing:
        # Rebuild in place: keeps position and any reference callers hold.
        tot = existing[0]
        for c in list(tot):
            tot.remove(c)
    else:
        tot = etree.Element(f"{{{etree.QName(total).namespace or NFE_NS}}}IBSCBSTot")
    _sub(tot, "vBCIBSCBS", _f2(_sum(gs, "vBC"), "vBCIBSCBS"))

    g_ibs = _sub(tot, "gIBS")
    uf = _sub(g_ibs, "gIBSUF")
    _sub(uf, "vDif", _f2(_sum(gs, "gIBSUF", "gDif", "vDif"), "vDif"))
    _sub(uf, "vDevTrib", _f2(_sum(gs, "gIBSUF", "gDevTrib", "vDevTrib"), "vDevTrib"))
    _sub(uf, "vIBSUF", _f2(_sum(gs, "gIBSUF", "vIBSUF"), "vIBSUF"))
    mun = _sub(g_ibs, "gIBSMun")
    _sub(mun, "vDif", _f2(_sum(gs, "gIBSMun", "gDif", "vDif"), "vDif"))
    _sub(mun, "vDevTrib", _f2(_sum(gs, "gIBSMun", "gDevTrib", "vDevTrib"), "vDevTrib"))
    _sub(mun, "vIBSMun", _f2(_sum(gs, "gIBSMun", "vIBSMun"), "vIBSMun"))
    _sub(g_ibs, "vIBS", _f2(_sum(gs, "vIBS"), "vIBS"))
    _sub(g_ibs, "vCredPres", _f2(_sum(creds, "gIBSCredPres", "vCredPres"), "vCredPres"))
    _sub(g_ibs, "vCredPresCondSus", _f2(_sum(creds, "gIBSCredPres", "vCredPresCondSus"), "vCredPresCondSus"))

    g_cbs = _sub(tot, "gCBS")
    _sub(g_cbs, "vDif", _f2(_sum(gs, "gCBS", "gDif", "vDif"), "vDif"))
    _sub(g_cbs, "vDevTrib", _f2(_sum(gs, "gCBS", "gDevTrib", "vDevTrib"), "vDevTrib"))
    _sub(g_cbs, "vCBS", _f2(_sum(gs, "gCBS", "vCBS"), "vCBS"))
    _sub(g_cbs, "vCredPres", _f2(_sum(creds, "gCBSCredPres", "vCredPres"), "vCredPres"))
    _sub(g_cbs, "vCredPresCondSus", _f2(_sum(creds, "gCBSCredPres", "vCredPresCondSus"), "vCredPresCondSus"))

    if monos:
        def mono_sum(tributo: str, sub: str, tag: str) -> Decimal:
            s = _ZERO
            for m in monos:
                for regime in ("AdRem", "AdValorem"):
                    s += _sum([m], f"g{tributo}Mono{regime}", sub, tag)
            return s

        gm = _sub(tot, "gMono")
        _sub(gm, "vIBSMono", _f2(mono_sum("IBS", "gMonoPadrao", "vIBSMono"), "vIBSMono"))
        _sub(gm, "vCBSMono", _f2(mono_sum("CBS", "gMonoPadrao", "vCBSMono"), "vCBSMono"))
        _sub(gm, "vIBSMonoReten", _f2(mono_sum("IBS", "gMonoReten", "vIBSMonoReten"), "vIBSMonoReten"))
        _sub(gm, "vCBSMonoReten", _f2(mono_sum("CBS", "gMonoReten", "vCBSMonoReten"), "vCBSMonoReten"))
        _sub(gm, "vIBSMonoRet", _f2(mono_sum("IBS", "gMonoRet", "vIBSMonoRet"), "vIBSMonoRet"))
        _sub(gm, "vCBSMonoRet", _f2(mono_sum("CBS", "gMonoRet", "vCBSMonoRet"), "vCBSMonoRet"))

    if ests:
        ge = _sub(tot, "gEstornoCred")
        _sub(ge, "vIBSEstCred", _f2(_sum(ests, "vIBSEstCred"), "vIBSEstCred"))
        _sub(ge, "vCBSEstCred", _f2(_sum(ests, "vCBSEstCred"), "vCBSEstCred"))

    if existing:
        return
    # total: ICMSTot, ISSQNtot?, retTrib?, ISTot?, IBSCBSTot?, vNFTot?
    anchor = None
    for name in ("ICMSTot", "ISSQNtot", "retTrib", "ISTot"):
        node = _child(total, name)
        if node is not None:
            anchor = node
    if anchor is not None:
        anchor.addnext(tot)
    else:
        total.insert(0, tot)
