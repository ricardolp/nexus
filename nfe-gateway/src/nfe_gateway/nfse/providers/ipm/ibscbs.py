"""Blocos IBS/CBS do layout IPM (NTE 122/2025, §3.1).

Diferente da SEFIN Nacional, a IPM **não calcula** o IBS/CBS: o emissor
manda alíquotas, base e valores, e a IPM confere (erros 00336–00355). Este
módulo calcula a partir do JSON canônico, com as fórmulas da própria NTE:

    vBC          = vServ - descIncond - vISSQN - vPIS - vCOFINS   (até 2026)
                 = vServ - descIncond - vISSQN                    (2027 em diante)
    pAliqEfet*   = p* × (1 - pRedAliq*)
    v*           = vBC × pAliqEfet*
    vDif*        = v* × pDif*
    vTotNF       = vLiq (2026)  |  vLiq + vCBS + vIBSTot (2027 em diante)

Alíquotas no contrato SAP são percentuais (``ibs_uf_aliquota = 0.1`` → 0,1%),
igual ao mapper de NF-e (``sefaz/ibscbs_nfe.py``).

A NTE 122/2025 traz um XML de exemplo (§3.4) que diverge da especificação
(§3.1). Seguimos a §3.1; confirme com ``<nfse_teste>1</nfse_teste>``.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from lxml import etree

from nfe_gateway.nfse.dps import resolve_c_ind_op
from nfe_gateway.nfse.providers.payload import PayloadError, digits, text
from nfe_gateway.sefaz.ibscbs_nfe import _dec, groups_for

_CENT = Decimal("0.01")
_HUNDRED = Decimal(100)
_ZERO = Decimal(0)


def money(v: Decimal) -> str:
    """Real IPM: vírgula decimal, sem separador de milhar."""
    q = v.quantize(_CENT, rounding=ROUND_HALF_UP)
    return f"{q:.2f}".replace(".", ",")


def rate(v: Decimal) -> str:
    """Percentual IPM: 2 a 4 casas, vírgula decimal (0,10 / 0,9000 → 0,90)."""
    q = v.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    s = f"{q:.4f}"
    while s.endswith("0") and len(s.split(".")[1]) > 2:
        s = s[:-1]
    return s.replace(".", ",")


@dataclass
class _Esfera:
    p: Decimal
    red: Decimal | None
    efet: Decimal
    valor: Decimal
    p_dif: Decimal | None
    v_dif: Decimal


_KEYS = {
    "uf": {
        "p": ("ibs_aliquota_uf", "ibs_uf_aliquota", "ibs_aliquota"),
        "red": ("ibs_uf_percentual_reducao_aliq", "ibs_uf_percentual_reducao", "ibs_cbs_percentual_reducao"),
        "dif": ("ibs_uf_percentual_diferimento", "ibs_cbs_percentual_diferimento"),
    },
    "mun": {
        "p": ("ibs_aliquota_mun", "ibs_mun_aliquota"),
        "red": ("ibs_mun_percentual_reduc_aliq", "ibs_mun_percentual_reducao", "ibs_cbs_percentual_reducao"),
        "dif": ("ibs_mun_percentual_diferimento", "ibs_cbs_percentual_diferimento"),
    },
    "cbs": {
        "p": ("cbs_aliquota",),
        "red": ("cbs_percentual_reducao_aliq", "cbs_percentual_reducao", "ibs_cbs_percentual_reducao"),
        "dif": ("cbs_percentual_diferimento", "ibs_cbs_percentual_diferimento"),
    },
}


def classification(payload: dict[str, Any], serv: dict[str, Any]) -> tuple[str, str]:
    cst = digits(
        serv.get("ibs_cbs_situacao_tributaria") or payload.get("ibs_cbs_situacao_tributaria")
    )
    c_class = digits(
        serv.get("ibs_cbs_classificacao_tributaria")
        or serv.get("ibs_cbs_classificacao_tributar")
        or payload.get("ibs_cbs_classificacao_tributaria")
        or payload.get("ibs_cbs_classificacao_tributar")
    )
    return cst, c_class


def _esfera(sources: dict[str, Any], key: str, vbc: Decimal, groups: dict[str, str]) -> _Esfera:
    k = _KEYS[key]
    p = _dec(sources, *k["p"])
    if p is None:
        raise PayloadError(f"IBS/CBS: informe a alíquota {k['p'][0]} (percentual, ex.: 0.1 = 0,1%).")
    red = _dec(sources, *k["red"])
    want_red = groups.get("gRed") == "obrigatorio" or (red is not None and red != 0)
    efet = p * (_HUNDRED - red) / _HUNDRED if (want_red and red) else p
    valor = (vbc * efet / _HUNDRED).quantize(_CENT, rounding=ROUND_HALF_UP)
    p_dif = _dec(sources, *k["dif"])
    want_dif = groups.get("gDif") == "obrigatorio"
    if want_dif and p_dif is None:
        raise PayloadError(f"IBS/CBS: CST com diferimento exige {k['dif'][0]}.")
    v_dif = (valor * p_dif / _HUNDRED).quantize(_CENT, rounding=ROUND_HALF_UP) if (want_dif and p_dif) else _ZERO
    return _Esfera(p=p, red=red if want_red else None, efet=efet, valor=valor,
                   p_dif=p_dif if want_dif else None, v_dif=v_dif)


def build_blocks(
    payload: dict[str, Any],
    serv: dict[str, Any],
    *,
    year: int,
    valor_servicos: Decimal,
    desconto_incondicionado: Decimal,
    valor_iss: Decimal,
    valor_pis: Decimal,
    valor_cofins: Decimal,
    valor_liquido: Decimal,
) -> tuple[etree._Element, etree._Element] | None:
    """Retorna (nf/IBSCBS, nfse/IBSCBS) ou None quando não há classificação."""
    cst, c_class = classification(payload, serv)
    if not cst and not c_class:
        return None
    if not cst or not c_class:
        raise PayloadError(
            "IBS/CBS incompleto: informe ibs_cbs_situacao_tributaria (CST) e "
            "ibs_cbs_classificacao_tributaria (cClassTrib) juntos."
        )
    cst = cst.zfill(3)
    c_class = c_class.zfill(6)
    if not c_class.startswith(cst):
        raise PayloadError(f"cClassTrib {c_class} não pertence ao CST {cst}.")

    groups = groups_for(cst, c_class)
    sources = {**payload, **serv}

    explicit_vbc = _dec(sources, "ibs_cbs_base_calculo", "ibs_base_calculo", "cbs_base_calculo")
    if explicit_vbc is not None and explicit_vbc != 0:
        vbc = explicit_vbc
    else:
        vbc = valor_servicos - desconto_incondicionado - valor_iss
        if year <= 2026:
            vbc -= valor_pis + valor_cofins
    if vbc < 0:
        raise PayloadError(f"IBS/CBS: base de cálculo negativa ({vbc}).")

    c_ind_op, _ = resolve_c_ind_op(payload, serv)
    if not c_ind_op:
        raise PayloadError(
            "cIndOp ausente: com IBS/CBS informado a IPM exige o indicador da operação "
            "(servico.codigo_indicador_operacao, 6 dígitos)."
        )

    tributado = "gIBSCBS" in groups
    uf = mun = cbs = None
    if tributado:
        uf = _esfera(sources, "uf", vbc, groups)
        mun = _esfera(sources, "mun", vbc, groups)
        cbs = _esfera(sources, "cbs", vbc, groups)

    # ----- nf/IBSCBS: valores e totalizadores ---------------------------------
    nf_block = etree.Element("IBSCBS")
    if tributado:
        assert uf and mun and cbs
        valores = etree.SubElement(nf_block, "valores")
        etree.SubElement(valores, "vBC").text = money(vbc)
        for tag, esf, p_tag, red_tag, efet_tag in (
            ("uf", uf, "pIBSUF", "pRedAliqUF", "pAliqEfetUF"),
            ("mun", mun, "pIBSMun", "pRedAliqMun", "pAliqEfetMun"),
            ("fed", cbs, "pCBS", "pRedAliqCBS", "pAliqEfetCBS"),
        ):
            g = etree.SubElement(valores, tag)
            etree.SubElement(g, p_tag).text = rate(esf.p)
            if esf.red is not None:
                etree.SubElement(g, red_tag).text = rate(esf.red)
            etree.SubElement(g, efet_tag).text = rate(esf.efet)

    v_ibs_uf = uf.valor - uf.v_dif if uf else _ZERO
    v_ibs_mun = mun.valor - mun.v_dif if mun else _ZERO
    v_cbs = cbs.valor - cbs.v_dif if cbs else _ZERO
    v_ibs_tot = v_ibs_uf + v_ibs_mun
    v_tot_nf = valor_liquido if year <= 2026 else valor_liquido + v_cbs + v_ibs_tot

    tot = etree.SubElement(nf_block, "totCIBS")
    etree.SubElement(tot, "vTotNF").text = money(v_tot_nf)
    if tributado:
        g_ibs = etree.SubElement(tot, "gIBS")
        etree.SubElement(g_ibs, "vIBSTot").text = money(v_ibs_tot)
        g_uf = etree.SubElement(g_ibs, "gIBSUFTot")
        etree.SubElement(g_uf, "vDifUF").text = money(uf.v_dif)  # type: ignore[union-attr]
        etree.SubElement(g_uf, "vIBSUF").text = money(v_ibs_uf)
        g_mun = etree.SubElement(g_ibs, "gIBSMunTot")
        etree.SubElement(g_mun, "vDifMun").text = money(mun.v_dif)  # type: ignore[union-attr]
        etree.SubElement(g_mun, "vIBSMun").text = money(v_ibs_mun)
        g_cbs = etree.SubElement(tot, "gCBS")
        etree.SubElement(g_cbs, "vDifCBS").text = money(cbs.v_dif)  # type: ignore[union-attr]
        etree.SubElement(g_cbs, "vCBS").text = money(v_cbs)

    # ----- nfse/IBSCBS: classificação -----------------------------------------
    root_block = etree.Element("IBSCBS")
    fin = text(payload.get("finalidade_emissao") or payload.get("fin_nfse") or "0")[:1] or "0"
    if fin not in {"0", "1", "2"}:
        raise PayloadError(f"finalidade_emissao (finNFSe) inválida: {fin!r}")
    etree.SubElement(root_block, "finNFSe").text = fin
    etree.SubElement(root_block, "cIndOp").text = c_ind_op
    ente = digits(payload.get("tipo_ente_governamental") or serv.get("tipo_ente_governamental"))
    if ente:
        etree.SubElement(root_block, "tpEnteGov").text = ente[:1]
        if ente[:1] == "9":
            etree.SubElement(root_block, "xTpEnteGov").text = text(
                payload.get("descricao_ente_governamental") or serv.get("descricao_ente_governamental")
            )[:100]
    trib = etree.SubElement(etree.SubElement(root_block, "valores"), "trib")
    g = etree.SubElement(trib, "gIBSCBS")
    etree.SubElement(g, "CST").text = cst
    etree.SubElement(g, "cClassTrib").text = c_class
    if tributado and groups.get("gDif") == "obrigatorio":
        gdif = etree.SubElement(g, "gDif")
        etree.SubElement(gdif, "pDifUF").text = rate(uf.p_dif or _ZERO)  # type: ignore[union-attr]
        etree.SubElement(gdif, "pDifMun").text = rate(mun.p_dif or _ZERO)  # type: ignore[union-attr]
        etree.SubElement(gdif, "pDifCBS").text = rate(cbs.p_dif or _ZERO)  # type: ignore[union-attr]

    return nf_block, root_block
