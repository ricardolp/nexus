"""Build unsigned DPS XML (NFS-e Nacional v1.00) from SAP nested JSON."""

from __future__ import annotations

import json
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from lxml import etree

NS = "http://www.sped.fazenda.gov.br/nfse"
NSMAP = {None: NS}
VER_APLIC = "NexusNFeGateway1.0.0"

# cIndOp derivation rules (Anexo VII / VIII da NFS-e Nacional). Data file so the
# fiscal team can extend it without a code change.
_CINDOP_RULES_PATH = Path(__file__).parent / "data" / "cindop_rules.json"


class SapNfseMapperError(ValueError):
    """Raised when the SAP NFS-e payload cannot be mapped to a DPS."""


def _text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _digits(value: Any) -> str:
    return "".join(ch for ch in _text(value) if ch.isdigit())


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    s = _text(value).lower()
    return s in {"true", "1", "x", "s", "sim", "yes"}


def _money(value: Any) -> str:
    if value is None:
        return "0.00"
    return f"{float(value):.2f}"


def _optional_positive_money(value: Any, *, field: str) -> str | None:
    """TSDec15V2 when the SAP sent a discount greater than zero; otherwise omit."""
    if value is None or _text(value) == "":
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError) as exc:
        raise SapNfseMapperError(f"{field} must be a number") from exc
    if amount < 0:
        raise SapNfseMapperError(f"{field} cannot be negative")
    if amount == 0:
        return None
    return f"{amount:.2f}"


def _rate(value: Any) -> str | None:
    if value is None or _text(value) == "":
        return None
    return f"{float(value):.4f}"


def _normalize_trib_nac(item: str) -> str:
    """LC 116 '17.09' → national '170901' (6 digits). TSCodTribNac is [0-9]{6}."""
    digits = _digits(item.replace(".", ""))
    if len(digits) == 4:
        digits = digits + "01"
    if len(digits) != 6:
        raise SapNfseMapperError("servico.item_lista_servico must map to 6-digit cTribNac")
    return digits


def generate_dps_id(*, cnpj: str, municipio: str, serie: str, numero: str) -> str:
    """DPS + mun(7) + tipoInscr(1) + inscrFed(14) + serie(5) + nDPS(15)."""
    cnpj_d = _digits(cnpj).zfill(14)[:14]
    mun = _digits(municipio).zfill(7)[:7]
    serie_digits = _digits(serie)
    serie_p = (serie_digits or "1").zfill(5)[:5]
    num_p = _digits(numero).zfill(15)[:15]
    return f"DPS{mun}2{cnpj_d}{serie_p}{num_p}"


def _parse_emission(raw: str) -> tuple[str, str]:
    """Return (dhEmi ISO-ish, dCompet YYYY-MM-DD)."""
    text = _text(raw)
    if not text:
        raise SapNfseMapperError("data_emissao is required")
    candidates = [text, text.replace("-0300", "-03:00").replace("+0000", "+00:00")]
    dt: datetime | None = None
    for c in candidates:
        try:
            dt = datetime.fromisoformat(c.replace("Z", "+00:00"))
            break
        except ValueError:
            continue
    if dt is None:
        try:
            d = date.fromisoformat(text[:10])
            return f"{d.isoformat()}T00:00:00-03:00", d.isoformat()
        except ValueError as exc:
            raise SapNfseMapperError(f"invalid data_emissao: {text}") from exc
    if dt.tzinfo is None:
        dh = f"{dt.strftime('%Y-%m-%dT%H:%M:%S')}-03:00"
    else:
        dh = dt.isoformat(timespec="seconds")
    return dh, dt.date().isoformat()


def _sub(parent: etree._Element, tag: str, text: str | None = None) -> etree._Element:
    el = etree.SubElement(parent, f"{{{NS}}}{tag}")
    if text is not None:
        el.text = text
    return el


def _fone(value: Any) -> str:
    digits = _digits(value)
    return digits if 6 <= len(digits) <= 20 else ""


def _append_endereco(parent: etree._Element, end: Any) -> None:
    """Emit TCEndereco only when required children are complete (avoids E1235)."""
    if not isinstance(end, dict):
        return
    x_lgr = _text(end.get("logradouro"))[:255]
    x_bairro = _text(end.get("bairro"))[:60]
    nro = (_text(end.get("numero")) or "SN")[:60]
    c_mun = _digits(end.get("codigo_municipio"))
    cep = _digits(end.get("cep"))
    if not x_lgr or not x_bairro or len(c_mun) != 7 or len(cep) != 8:
        return
    end_el = _sub(parent, "end")
    end_nac = _sub(end_el, "endNac")
    _sub(end_nac, "cMun", c_mun)
    _sub(end_nac, "CEP", cep)
    _sub(end_el, "xLgr", x_lgr)
    _sub(end_el, "nro", nro)
    if _text(end.get("complemento")):
        _sub(end_el, "xCpl", _text(end.get("complemento"))[:156])
    _sub(end_el, "xBairro", x_bairro)


def _append_pessoa(el: etree._Element, pessoa: dict[str, Any], *, default_name: str) -> None:
    """TCInfoPessoa: CNPJ|CPF|NIF|cNaoNIF, IM?, xNome, end?, fone?, email?."""
    cnpj = _digits(pessoa.get("cnpj"))
    cpf = _digits(pessoa.get("cpf"))
    if cnpj:
        _sub(el, "CNPJ", cnpj.zfill(14)[:14])
    elif cpf:
        _sub(el, "CPF", cpf.zfill(11)[:11])
    elif _text(pessoa.get("nif")):
        _sub(el, "NIF", _text(pessoa.get("nif")))
    else:
        # Consumidor não identificado: XSD choice allows cNaoNIF.
        _sub(el, "cNaoNIF", "1")
    if _text(pessoa.get("inscricao_municipal")):
        _sub(el, "IM", _text(pessoa.get("inscricao_municipal"))[:15])
    _sub(el, "xNome", (_text(pessoa.get("razao_social") or pessoa.get("nome")) or default_name)[:150])
    _append_endereco(el, pessoa.get("endereco") or {})
    if _fone(pessoa.get("telefone")):
        _sub(el, "fone", _fone(pessoa.get("telefone")))
    if _text(pessoa.get("email")):
        _sub(el, "email", _text(pessoa.get("email"))[:80])


def _natureza_to_trib_issqn(natureza: str) -> str:
    mapping = {
        "1": "1",
        "2": "1",
        "3": "2",
        "4": "3",
        "5": "4",
        "6": "4",
    }
    return mapping.get(_text(natureza), "1")


def _op_simp_nac(payload: dict[str, Any]) -> str:
    """TSOpSimpNac: 1=Não Optante, 2=MEI, 3=ME/EPP.

    Accepts explicit ``op_simp_nac`` / ``opSimpNac``, else maps
    ``optante_simples_nacional`` bool (true→3, false→1).
    """
    explicit = _text(payload.get("op_simp_nac") or payload.get("opSimpNac"))
    if explicit in {"1", "2", "3"}:
        return explicit
    return "3" if _boolish(payload.get("optante_simples_nacional")) else "1"


def _reg_esp_trib(payload: dict[str, Any]) -> str:
    """TSRegEspTrib: 0=Nenhum … 7=Específicos municipais. Default 0."""
    raw = _text(
        payload.get("regime_especial_tributacao")
        or payload.get("reg_esp_trib")
        or payload.get("regEspTrib")
    )
    if raw.isdigit() and len(raw) == 1:
        return raw
    return "0"


def _normalize_nbs(value: Any) -> str:
    """NBS in DPS is digits-only (e.g. 1.2002.90.00 → 120029000)."""
    return _digits(value)


_TOT_SPHERES = ("federal", "estadual", "municipal")
# SAP contract sends approximate Lei 12.741 amounts either as money
# (total_tributos / valor_total_tributos_*) or as percentages
# (percentual_total_tributos_fed/est/mun). DPS vTotTrib wants money.
_TOT_MONEY_KEYS = {
    "federal": ("valor_total_tributos_fed", "valor_tributos_federais"),
    "estadual": ("valor_total_tributos_est", "valor_tributos_estaduais"),
    "municipal": ("valor_total_tributos_mun", "valor_tributos_municipais"),
}
_TOT_PERCENT_KEYS = {
    "federal": ("percentual_total_tributos_fed",),
    "estadual": ("percentual_total_tributos_est",),
    "municipal": ("percentual_total_tributos_mun",),
}


def _present(value: Any) -> bool:
    return value is not None and _text(value) != ""


def _first_present(sources: list[Any], keys: tuple[str, ...]) -> Any:
    for src in sources:
        if not isinstance(src, dict):
            continue
        for key in keys:
            if key in src and _present(src.get(key)):
                return src.get(key)
    return None


def _percent_to_amount(percent: Any, base: float) -> float:
    """0.34 (fraction) and 34 (percent) both mean 34% of base. Same rule as pAliq."""
    return base * _percent_points(percent) / 100.0


def _percent_points(percent: Any) -> float:
    """0.34 and 34 both mean 34 percentage points."""
    f = float(percent)
    if abs(f) <= 1:
        return f * 100.0
    return f


# When fed+est+mun sum to 100, SAP sent the share of the tax among spheres
# (PIS+COFINS vs ISS), not a Lei 12.741 rate on the service. Applying that
# share to valor_servicos makes the approximate total equal the price.
_INVOICE_FED_KEYS = ("valor_pis", "valor_cofins", "valor_inss", "valor_ir", "valor_csll")


def _sum_present(sources: list[Any], keys: tuple[str, ...]) -> tuple[float, bool]:
    total = 0.0
    found = False
    for key in keys:
        value = _first_present(sources, (key,))
        if value is None:
            continue
        total += float(value)
        found = True
    return total, found


def _invoice_tax_amounts(sources: list[Any]) -> dict[str, float] | None:
    """PIS/COFINS/INSS/IR/CSLL as federal and ISS as municipal."""
    federal, fed_ok = _sum_present(sources, _INVOICE_FED_KEYS)
    municipal = _first_present(sources, ("valor_iss",))
    if municipal is None:
        municipal = _first_present(sources, ("valor_iss_retido",))
    mun_ok = municipal is not None
    if not fed_ok and not mun_ok:
        return None
    return {
        "federal": federal if fed_ok else 0.0,
        "estadual": 0.0,
        "municipal": float(municipal) if mun_ok else 0.0,
    }


def _nao_optante_totals(payload: dict[str, Any], serv: dict[str, Any]) -> dict[str, Any] | None:
    """Monetary vTotTribFed/Est/Mun for opSimpNac=1.

    Prefers an explicit total_tributos object. Otherwise converts the SAP
    percentage fields (or direct valor_* aliases) using valor_servicos.
    Percentages that sum to 100 are a split of the tax (PIS+COFINS vs ISS),
    not a rate on the service: the invoice amounts are used instead.
    A sphere omitted while another is present becomes 0.
    """
    sources: list[Any] = [serv, payload]
    tot = serv.get("total_tributos") if isinstance(serv.get("total_tributos"), dict) else None
    if tot is None and isinstance(payload.get("total_tributos"), dict):
        tot = payload.get("total_tributos")
    if isinstance(tot, dict) and all(k in tot for k in _TOT_SPHERES):
        return tot

    base_raw = serv.get("valor_servicos")
    base = float(base_raw) if _present(base_raw) else 0.0
    percent_points = []
    money_hit = False
    for sphere in _TOT_SPHERES:
        if isinstance(tot, dict) and sphere in tot and _present(tot.get(sphere)):
            money_hit = True
            continue
        if _first_present(sources, _TOT_MONEY_KEYS[sphere]) is not None:
            money_hit = True
            continue
        percent = _first_present(sources, _TOT_PERCENT_KEYS[sphere])
        if percent is not None:
            percent_points.append(_percent_points(percent))
    if percent_points and not money_hit and abs(sum(percent_points) - 100.0) <= 0.06:
        invoice = _invoice_tax_amounts(sources)
        if invoice is not None:
            return invoice

    found = False
    out: dict[str, Any] = {}
    for sphere in _TOT_SPHERES:
        if isinstance(tot, dict) and sphere in tot and _present(tot.get(sphere)):
            out[sphere] = tot.get(sphere)
            found = True
            continue
        money = _first_present(sources, _TOT_MONEY_KEYS[sphere])
        if money is not None:
            out[sphere] = money
            found = True
            continue
        percent = _first_present(sources, _TOT_PERCENT_KEYS[sphere])
        if percent is not None:
            out[sphere] = _percent_to_amount(percent, base)
            found = True
            continue
        out[sphere] = 0
    if not found:
        return None
    return out


def build_unsigned_dps(payload: dict[str, Any], *, homologacao: bool) -> etree._Element:
    prest = payload.get("prestador") or {}
    toma = payload.get("tomador") or {}
    serv = payload.get("servico") or {}
    interm = payload.get("intermediario")

    cnpj = _digits(prest.get("cnpj"))
    if len(cnpj) != 14:
        raise SapNfseMapperError("prestador.cnpj must have 14 digits")

    serie = _text(payload.get("serie_rps"))
    numero = _text(payload.get("numero_rps"))
    if not serie or not numero:
        raise SapNfseMapperError("serie_rps and numero_rps are required")

    c_loc_emi = _digits(prest.get("codigo_municipio") or serv.get("codigo_municipio"))
    if len(c_loc_emi) != 7:
        raise SapNfseMapperError("prestador/servico codigo_municipio must be IBGE 7 digits")

    c_loc_prest = _digits(serv.get("codigo_municipio")) or c_loc_emi
    dh_emi, d_compet = _parse_emission(_text(payload.get("data_emissao")))
    dps_id = generate_dps_id(cnpj=cnpj, municipio=c_loc_emi, serie=serie, numero=numero)

    # Authorized production samples use versao="1.01" on DPS.
    root = etree.Element(f"{{{NS}}}DPS", nsmap=NSMAP, versao="1.01")
    inf = etree.SubElement(root, f"{{{NS}}}infDPS", Id=dps_id)

    _sub(inf, "tpAmb", "2" if homologacao else "1")
    _sub(inf, "dhEmi", dh_emi)
    _sub(inf, "verAplic", VER_APLIC)
    _sub(inf, "serie", serie)
    n_dps = (_digits(numero) or numero).lstrip("0")
    if not n_dps:
        raise SapNfseMapperError("numero_rps must be a positive integer")
    _sub(inf, "nDPS", n_dps)
    _sub(inf, "dCompet", d_compet)
    _sub(inf, "tpEmit", "1")
    _sub(inf, "cLocEmi", c_loc_emi)

    # Substitution group (optional): emitting a DPS with subst causes SEFIN to
    # generate event 105102 atomically and cancel the referenced NFS-e.
    _append_subst(inf, payload)

    prest_el = _sub(inf, "prest")
    _sub(prest_el, "CNPJ", cnpj)
    if _text(prest.get("inscricao_municipal")):
        _sub(prest_el, "IM", _text(prest.get("inscricao_municipal"))[:15])
    # TCInfoPrestador: CNPJ, IM?, xNome?, end?, fone?, email?, regTrib.
    if _fone(prest.get("telefone") or prest.get("fone")):
        _sub(prest_el, "fone", _fone(prest.get("telefone") or prest.get("fone")))
    if _text(prest.get("email")):
        _sub(prest_el, "email", _text(prest.get("email"))[:80])
    op_simp = _op_simp_nac(payload)
    reg_trib = _sub(prest_el, "regTrib")
    _sub(reg_trib, "opSimpNac", op_simp)
    if op_simp == "3":
        reg_ap = _text(payload.get("regime_apuracao_sn") or payload.get("reg_ap_trib_sn")) or "1"
        _sub(reg_trib, "regApTribSN", reg_ap)
    _sub(reg_trib, "regEspTrib", _reg_esp_trib(payload))

    _append_pessoa(_sub(inf, "toma"), toma, default_name="CONSUMIDOR NAO IDENTIFICADO")

    if interm:
        inter_el = _sub(inf, "interm")
        if _digits(interm.get("cnpj")):
            _sub(inter_el, "CNPJ", _digits(interm.get("cnpj")).zfill(14)[:14])
        elif _digits(interm.get("cpf")):
            _sub(inter_el, "CPF", _digits(interm.get("cpf")).zfill(11)[:11])
        _sub(inter_el, "xNome", (_text(interm.get("razao_social")) or "INTERMEDIARIO")[:150])

    serv_el = _sub(inf, "serv")
    loc = _sub(serv_el, "locPrest")
    _sub(loc, "cLocPrestacao", c_loc_prest)
    cserv = _sub(serv_el, "cServ")
    item = _text(serv.get("item_lista_servico"))
    if not item:
        raise SapNfseMapperError("servico.item_lista_servico is required")
    _sub(cserv, "cTribNac", _normalize_trib_nac(item))
    # TCCodTribMun is exactly 3 digits — longer municipal codes fail E1235.
    trib_mun = _digits(serv.get("codigo_tributario_municipio") or serv.get("codigo_tributacao_municipio"))
    if len(trib_mun) == 3:
        _sub(cserv, "cTribMun", trib_mun)
    disc = _text(serv.get("discriminacao"))
    if not disc:
        raise SapNfseMapperError("servico.discriminacao is required")
    _sub(cserv, "xDescServ", disc)
    # TCCServ has no cCNAE (cTribNac, cTribMun?, xDescServ, cNBS?, cIntContrib?).
    nbs = _normalize_nbs(serv.get("codigo_nbs"))
    if len(nbs) == 9:
        _sub(cserv, "cNBS", nbs)

    valores = _sub(inf, "valores")
    vserv = _sub(valores, "vServPrest")
    amount = serv.get("valor_servicos")
    if amount is None:
        raise SapNfseMapperError("servico.valor_servicos is required")
    # TCVServPrest sequence: vReceb?, vServ
    if serv.get("valor_recebido") is not None and _text(serv.get("valor_recebido")) != "":
        _sub(vserv, "vReceb", _money(serv.get("valor_recebido")))
    _sub(vserv, "vServ", _money(amount))
    # TCVDescCondIncond is optional and must sit between vServPrest and trib.
    # SEFIN uses vDescIncond in the ISS base (vServ - vDescIncond - …) and the
    # DANFSE prints both discounts from this group.
    _append_desc_cond_incond(valores, serv, service_amount=float(amount))

    trib = _sub(valores, "trib")
    trib_mun_el = _sub(trib, "tribMun")
    _sub(trib_mun_el, "tribISSQN", _natureza_to_trib_issqn(_text(payload.get("natureza_operacao"))))
    # tpRetISSQN: 1=Não Retido, 2=Retido pelo Tomador, 3=Retido pelo Intermediário
    _sub(trib_mun_el, "tpRetISSQN", "2" if _boolish(serv.get("iss_retido")) else "1")
    # pAliq is only accepted for ME/EPP (opSimpNac=3); for Não Optante/MEI the
    # Sistema Nacional takes the rate from the município parametrization and
    # rejects the DPS if it is informed.
    if op_simp == "3" and serv.get("aliquota") is not None and _text(serv.get("aliquota")) != "":
        f = float(serv.get("aliquota"))
        if f <= 1:
            f *= 100
        _sub(trib_mun_el, "pAliq", f"{f:.2f}")

    # tribFed/piscofins — CST and retention must come from the emitter payload.
    cst_pc = _text(
        serv.get("situacao_tributaria_pis_cofins")
        or payload.get("situacao_tributaria_pis_cofins")
    )
    if not cst_pc:
        raise SapNfseMapperError("situacao_tributaria_pis_cofins is required")
    tp_ret_pc = _text(
        serv.get("tipo_retencao_pis_cofins")
        or payload.get("tipo_retencao_pis_cofins")
    )
    if not tp_ret_pc:
        raise SapNfseMapperError("tipo_retencao_pis_cofins is required")
    trib_fed = _sub(trib, "tribFed")
    piscofins = _sub(trib_fed, "piscofins")
    _sub(piscofins, "CST", cst_pc[:2].zfill(2))
    if serv.get("valor_pis") is not None and _text(serv.get("valor_pis")) != "":
        _sub(piscofins, "vPis", _money(serv.get("valor_pis")))
    if serv.get("valor_cofins") is not None and _text(serv.get("valor_cofins")) != "":
        _sub(piscofins, "vCofins", _money(serv.get("valor_cofins")))
    _sub(piscofins, "tpRetPisCofins", tp_ret_pc[:1])

    # totTrib choice depends on opSimpNac (E0710 / E0712 / E0713):
    #   1 Não Optante → vTotTrib (fed/est/mun from emitter)
    #   2 MEI         → indTotTrib=0
    #   3 ME/EPP      → pTotTribSN (percent from emitter)
    tot = serv.get("total_tributos") or payload.get("total_tributos") or {}
    tot_trib = _sub(trib, "totTrib")
    if op_simp == "3":
        p_sn = serv.get("percentual_total_tributos")
        if p_sn is None and isinstance(tot, dict):
            p_sn = tot.get("percentual_sn") or tot.get("simples_nacional")
        if p_sn is None or _text(p_sn) == "":
            raise SapNfseMapperError(
                "percentual_total_tributos (pTotTribSN) is required for ME/EPP (opSimpNac=3)"
            )
        f = float(p_sn)
        if f <= 1:
            f *= 100
        _sub(tot_trib, "pTotTribSN", f"{f:.2f}")
    elif op_simp == "2":
        _sub(tot_trib, "indTotTrib", "0")
    else:
        resolved = _nao_optante_totals(payload, serv)
        if resolved is None:
            raise SapNfseMapperError(
                "total_tributos.federal/estadual/municipal are required for Não Optante (opSimpNac=1)"
            )
        v_tot = _sub(tot_trib, "vTotTrib")
        _sub(v_tot, "vTotTribFed", _money(resolved.get("federal")))
        _sub(v_tot, "vTotTribEst", _money(resolved.get("estadual")))
        _sub(v_tot, "vTotTribMun", _money(resolved.get("municipal")))

    # Reforma tributária (IBS/CBS). Obrigatório desde 01/10/2026 para prestadores
    # do regime regular sujeitos ao ISS (Ato Conjunto RFB/CGIBS nº 4/2026); a
    # SEFIN não rejeita a ausência do grupo até 31/12/2026.
    _append_ibscbs(inf, payload, serv)

    return root


def _append_desc_cond_incond(valores: etree._Element, serv: dict[str, Any], *, service_amount: float) -> None:
    """Emit valores/vDescCondIncond from desconto_incondicionado / desconto_condicionado."""
    v_incond = _optional_positive_money(serv.get("desconto_incondicionado"), field="desconto_incondicionado")
    v_cond = _optional_positive_money(serv.get("desconto_condicionado"), field="desconto_condicionado")
    if v_incond is None and v_cond is None:
        return
    total = float(v_incond or 0) + float(v_cond or 0)
    if total > service_amount + 0.001:
        raise SapNfseMapperError(
            "desconto_incondicionado + desconto_condicionado cannot exceed valor_servicos"
        )
    grp = _sub(valores, "vDescCondIncond")
    if v_incond is not None:
        _sub(grp, "vDescIncond", v_incond)
    if v_cond is not None:
        _sub(grp, "vDescCond", v_cond)


def _append_subst(inf: etree._Element, payload: dict[str, Any]) -> None:
    """Append optional <subst> when the payload references an NFS-e to replace."""
    chave = _digits(
        payload.get("chave_nfse_substituida")
        or payload.get("chave_acesso_substituida")
        or payload.get("ch_substda")
    )
    # Access keys may include alphanumerics for CNPJ reform; prefer alnum strip.
    if not chave:
        raw = _text(
            payload.get("chave_nfse_substituida")
            or payload.get("chave_acesso_substituida")
            or payload.get("ch_substda")
        )
        chave = "".join(c for c in raw if c.isalnum()).upper()
    if not chave:
        return
    if len(chave) != 50:
        raise SapNfseMapperError("chave_nfse_substituida must have exactly 50 characters")

    c_motivo = _digits(
        payload.get("motivo_substituicao")
        or payload.get("c_motivo_substituicao")
        or payload.get("c_motivo")
    )
    if not c_motivo:
        c_motivo = "99"
    # National layout uses 2-digit substitution codes (01–05, 99).
    if len(c_motivo) == 1:
        c_motivo = c_motivo.zfill(2)
    if c_motivo not in {"01", "02", "03", "04", "05", "99"}:
        raise SapNfseMapperError("motivo_substituicao must be 01–05 or 99")

    x_motivo = _text(
        payload.get("justificativa_substituicao")
        or payload.get("x_motivo_substituicao")
        or payload.get("x_motivo")
    )
    if c_motivo == "99" and len(x_motivo) < 15:
        raise SapNfseMapperError("justificativa_substituicao is required (min 15 chars) when motivo is 99")

    subst = _sub(inf, "subst")
    _sub(subst, "chSubstda", chave)
    _sub(subst, "cMotivo", c_motivo)
    if x_motivo:
        _sub(subst, "xMotivo", x_motivo[:255])


@lru_cache(maxsize=1)
def _cindop_rules() -> dict[str, dict[str, str]]:
    try:
        data = json.loads(_CINDOP_RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    rules = data.get("por_codigo") if isinstance(data, dict) else None
    return rules if isinstance(rules, dict) else {}


def _infer_c_ind_op(payload: dict[str, Any], serv: dict[str, Any]) -> str:
    """cIndOp from the rule table when SAP omitted the indicator.

    The table is keyed by cTribNac (6 digits) or LC 116 subitem (4 digits).
    Location-dependent rules pick ``estabelecimento_fornecedor`` when the
    service municipality is the supplier's, else ``outro_local``. Items with
    no rule return "" — the caller decides (we never guess a code).
    """
    try:
        item = _normalize_trib_nac(_text(serv.get("item_lista_servico")))
    except SapNfseMapperError:
        return ""
    rules = _cindop_rules()
    rule = rules.get(item) or rules.get(item[:4])
    if not isinstance(rule, dict):
        return ""
    if _digits(rule.get("padrao")):
        return _digits(rule.get("padrao"))
    prest = payload.get("prestador") or {}
    prest_mun = _digits(prest.get("codigo_municipio"))
    serv_mun = _digits(serv.get("codigo_municipio")) or prest_mun
    if prest_mun and serv_mun and prest_mun != serv_mun:
        return _digits(rule.get("outro_local"))
    return _digits(rule.get("estabelecimento_fornecedor"))


def resolve_c_ind_op(payload: dict[str, Any], serv: dict[str, Any]) -> tuple[str, str]:
    """Return (cIndOp, origem). origem: 'payload' | 'regra' | ''."""
    explicit = _text(
        serv.get("codigo_indicador_operacao")
        or serv.get("c_ind_op")
        or serv.get("cIndOp")
        or payload.get("codigo_indicador_operacao")
        or payload.get("c_ind_op")
        or payload.get("cIndOp")
    )
    if explicit:
        digits = _digits(explicit)
        # Codes start with 0 (01xxxx–05xxxx): a JSON number loses it (50101).
        if not digits or len(digits) > 6 or len(digits) < 5:
            raise SapNfseMapperError(
                f"codigo_indicador_operacao (cIndOp) deve ter 6 dígitos (Anexo VII da NFS-e); recebido {explicit!r}"
            )
        return digits.zfill(6), "payload"
    inferred = _infer_c_ind_op(payload, serv)
    if len(inferred) == 6:
        return inferred, "regra"
    return "", ""


def _ibscbs_classification(payload: dict[str, Any], serv: dict[str, Any]) -> tuple[str, str]:
    cst = _digits(
        serv.get("ibs_cbs_situacao_tributaria")
        or payload.get("ibs_cbs_situacao_tributaria")
    )
    c_class = _digits(
        serv.get("ibs_cbs_classificacao_tributaria")
        or serv.get("ibs_cbs_classificacao_tributar")
        or payload.get("ibs_cbs_classificacao_tributaria")
        or payload.get("ibs_cbs_classificacao_tributar")
    )
    return cst, c_class


# Competência >= 2026-10-01 exige o grupo (E0855). CST 000 tem IndExigeTrib,
# então cIndOp entra. O Anexo VI v1.04.01 manda indDest para depois do tomador,
# mas a SefinNacional 1.6.0 ainda espera interm/serv nesse ponto e rejeita o
# elemento (esquema). indDest permanece dentro de IBSCBS.
_EMIT_DPS_IBSCBS = True


def _validate_ind_dest(payload: dict[str, Any]) -> str:
    ind_dest = _text(payload.get("indicador_destinatario") or payload.get("ind_dest") or "0") or "0"
    if ind_dest[:1] not in {"0", "1"}:
        raise SapNfseMapperError(f"indicador_destinatario (indDest) deve ser 0 ou 1: {ind_dest!r}")
    dest = payload.get("destinatario") or payload.get("destinatario_operacao")
    if ind_dest[:1] == "1" and not isinstance(dest, dict):
        raise SapNfseMapperError(
            "indicador_destinatario=1 significa que o destinatário do serviço não é o tomador: "
            "informe o objeto 'destinatario' (cnpj/cpf, razao_social, endereco) ou envie 0 "
            "quando o próprio tomador for o destinatário."
        )
    return ind_dest[:1]


def _append_ibscbs(inf: etree._Element, payload: dict[str, Any], serv: dict[str, Any]) -> None:
    """Validate and, when enabled, append <IBSCBS>.

    Sem CST e sem cClassTrib o grupo é omitido (prestador fora do cronograma,
    ex.: Simples Nacional até 2027). Com a classificação informada, os códigos
    são conferidos. A escrita no XML depende de ``_EMIT_DPS_IBSCBS``.
    """
    cst, c_class = _ibscbs_classification(payload, serv)
    if not cst and not c_class:
        return
    if not cst or not c_class:
        raise SapNfseMapperError(
            "IBS/CBS incompleto: informe ibs_cbs_situacao_tributaria (CST) e "
            "ibs_cbs_classificacao_tributaria (cClassTrib) juntos."
        )
    if len(cst) > 3 or len(c_class) > 6:
        raise SapNfseMapperError(
            f"IBS/CBS inválido: CST deve ter 3 dígitos e cClassTrib 6 dígitos (CST={cst}, cClassTrib={c_class})."
        )
    cst = cst.zfill(3)
    c_class = c_class.zfill(6)
    if not c_class.startswith(cst):
        raise SapNfseMapperError(
            f"cClassTrib {c_class} não pertence ao CST {cst} (os 3 primeiros dígitos do cClassTrib são o CST)."
        )

    c_ind_op, _origem = resolve_c_ind_op(payload, serv)
    if not c_ind_op:
        item = _text(serv.get("item_lista_servico"))
        nbs = _text(serv.get("codigo_nbs"))
        raise SapNfseMapperError(
            "cIndOp ausente: com IBS/CBS informado (CST "
            f"{cst} / cClassTrib {c_class}) a DPS precisa do indicador da operação "
            "(servico.codigo_indicador_operacao, 6 dígitos). Sem ele a SEFIN "
            "responde E999. Informe no SAP ou cadastre o cIndOp no serviço da "
            f"empresa (item LC 116 {item or '?'}, NBS {nbs or '?'})."
        )

    fin = _text(payload.get("finalidade_emissao") or payload.get("fin_nfse") or "0") or "0"
    ind_final = _text(payload.get("consumidor_final") or payload.get("ind_final") or "0") or "0"
    if fin[:1] not in {"0", "1", "2"}:
        raise SapNfseMapperError(f"finalidade_emissao (finNFSe) inválida: {fin!r}")
    if ind_final[:1] not in {"0", "1"}:
        raise SapNfseMapperError(f"consumidor_final (indFinal) deve ser 0 ou 1: {ind_final!r}")
    ind_dest = _validate_ind_dest(payload)

    if not _EMIT_DPS_IBSCBS:
        return

    ibs = _sub(inf, "IBSCBS")
    _sub(ibs, "finNFSe", fin[:1])
    _sub(ibs, "indFinal", ind_final[:1])
    _sub(ibs, "cIndOp", c_ind_op)
    _sub(ibs, "indDest", ind_dest)
    if ind_dest == "1":
        dest = payload.get("destinatario") or payload.get("destinatario_operacao")
        _append_pessoa(_sub(ibs, "dest"), dest, default_name="DESTINATARIO")
    # Homologação em 13/10/2026 19:20 voltou a exigir trib/gIBSCBS. CST direto
    # em trib é recusado: "invalid child element 'CST', expected 'gIBSCBS'".
    # De manhã o schema inverso (CST direto) estava no ar; a DPS segue o que
    # a SEFIN valida agora. Alíquotas e valores continuam com a calculadora.
    valores = _sub(ibs, "valores")
    trib = _sub(valores, "trib")
    grupo = _sub(trib, "gIBSCBS")
    _sub(grupo, "CST", cst)
    _sub(grupo, "cClassTrib", c_class)


def dps_xml_bytes(root: etree._Element) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")
