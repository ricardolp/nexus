"""Build unsigned DPS XML (NFS-e Nacional v1.00) from SAP nested JSON."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from lxml import etree

NS = "http://www.sped.fazenda.gov.br/nfse"
NSMAP = {None: NS}
VER_APLIC = "NexusNFeGateway1.0.0"


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

    toma_el = _sub(inf, "toma")
    toma_cnpj = _digits(toma.get("cnpj"))
    toma_cpf = _digits(toma.get("cpf"))
    if toma_cnpj:
        _sub(toma_el, "CNPJ", toma_cnpj.zfill(14)[:14])
    elif toma_cpf:
        _sub(toma_el, "CPF", toma_cpf.zfill(11)[:11])
    elif _text(toma.get("nif")):
        _sub(toma_el, "NIF", _text(toma.get("nif")))
    else:
        # Consumidor não identificado: XSD choice allows cNaoNIF.
        _sub(toma_el, "cNaoNIF", "1")
    if _text(toma.get("inscricao_municipal")):
        _sub(toma_el, "IM", _text(toma.get("inscricao_municipal"))[:15])
    # TCInfoPessoa sequence: CNPJ, IM?, xNome (required), end?, fone?, email?
    _sub(toma_el, "xNome", (_text(toma.get("razao_social")) or "CONSUMIDOR NAO IDENTIFICADO")[:150])
    _append_endereco(toma_el, toma.get("endereco") or {})
    if _fone(toma.get("telefone")):
        _sub(toma_el, "fone", _fone(toma.get("telefone")))
    if _text(toma.get("email")):
        _sub(toma_el, "email", _text(toma.get("email"))[:80])

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

    trib = _sub(valores, "trib")
    trib_mun_el = _sub(trib, "tribMun")
    _sub(trib_mun_el, "tribISSQN", _natureza_to_trib_issqn(_text(payload.get("natureza_operacao"))))
    # tpRetISSQN: 1=Não Retido, 2=Retido pelo Tomador, 3=Retido pelo Intermediário
    _sub(trib_mun_el, "tpRetISSQN", "2" if _boolish(serv.get("iss_retido")) else "1")
    if serv.get("aliquota") is not None and _text(serv.get("aliquota")) != "":
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
        if not isinstance(tot, dict) or not all(
            k in tot for k in ("federal", "estadual", "municipal")
        ):
            raise SapNfseMapperError(
                "total_tributos.federal/estadual/municipal are required for Não Optante (opSimpNac=1)"
            )
        v_tot = _sub(tot_trib, "vTotTrib")
        _sub(v_tot, "vTotTribFed", _money(tot.get("federal")))
        _sub(v_tot, "vTotTribEst", _money(tot.get("estadual")))
        _sub(v_tot, "vTotTribMun", _money(tot.get("municipal")))

    # Reforma tributária (IBS/CBS): optional through 2026 (SE/CGNFS-e — absence does
    # not reject until 31/12/2026; SN destaque from 01/01/2027 per Ato Conjunto
    # RFB/CGIBS nº 4/2026). Emit classification-only group when payload provides it;
    # rates are computed on the authorized NFSe response side.
    _append_ibscbs(inf, payload, serv)

    return root


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


def _append_ibscbs(inf: etree._Element, payload: dict[str, Any], serv: dict[str, Any]) -> None:
    """Append <IBSCBS> only when CST and cClassTrib are explicitly provided.

    Omitting the group is valid while IBS/CBS remains optional on the national
    layout; do not invent transitional CST/cClassTrib defaults.
    """
    cst = _digits(
        serv.get("ibs_cbs_situacao_tributaria")
        or payload.get("ibs_cbs_situacao_tributaria")
    )
    c_class = _digits(
        serv.get("ibs_cbs_classificacao_tributaria")
        or serv.get("ibs_cbs_classificacao_tributar")
        or payload.get("ibs_cbs_classificacao_tributaria")
    )
    if not cst or not c_class:
        return

    c_ind_op = _digits(
        serv.get("codigo_indicador_operacao")
        or payload.get("codigo_indicador_operacao")
    )
    if not c_ind_op:
        raise SapNfseMapperError(
            "codigo_indicador_operacao is required when IBSCBS classification is provided"
        )
    fin = _text(payload.get("finalidade_emissao") or payload.get("fin_nfse") or "0") or "0"
    ind_final = _text(payload.get("consumidor_final") or payload.get("ind_final") or "0") or "0"
    ind_dest = _text(payload.get("indicador_destinatario") or payload.get("ind_dest") or "0") or "0"

    ibs = _sub(inf, "IBSCBS")
    _sub(ibs, "finNFSe", fin[:1])
    _sub(ibs, "indFinal", ind_final[:1])
    _sub(ibs, "cIndOp", c_ind_op[:6].zfill(6))
    _sub(ibs, "indDest", ind_dest[:1])
    valores = _sub(ibs, "valores")
    trib = _sub(valores, "trib")
    g = _sub(trib, "gIBSCBS")
    _sub(g, "CST", cst[:3].zfill(3))
    _sub(g, "cClassTrib", c_class[:6].zfill(6))


def dps_xml_bytes(root: etree._Element) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")
