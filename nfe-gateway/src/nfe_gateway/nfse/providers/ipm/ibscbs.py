"""IBS/CBS no layout IPM — NTE 122/2025 v1.7 (12/08/2026).

Na emissão o XML leva só a **classificação**; quem calcula base, alíquotas e
valores é a IPM (como a SEFIN Nacional faz na DPS):

    <nf><IBSCBS><cLocalidadeIncid/></IBSCBS></nf>          município (IBGE) de incidência
    <nfse><IBSCBS>                                          depois de </itens>
        finNFSe, indFinal, cIndOp, [tpOper], [gRefNFSe/refNFSe], [imovel],
        valores/trib/gIBSCBS/(CST, cClassTrib)
    </IBSCBS></nfse>

O retorno completo devolve o cálculo em ``nf/IBSCBS`` (valores + totCIBS),
lido por ``extract_return_ibscbs`` no mesmo formato do ``nfse/retorno.py`` da
SEFIN, para o backend persistir e devolver no webhook.

A v1.0 desta nota (exemplo publicado por algumas prefeituras) pedia que o
emissor mandasse os valores calculados; a v1.7 não pede mais.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from lxml import etree

from nfe_gateway.nfse.dps import resolve_c_ind_op
from nfe_gateway.nfse.providers.payload import PayloadError, digits, text

_CENT = Decimal("0.01")


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


def localidade_incidencia(
    payload: dict[str, Any],
    serv: dict[str, Any],
    *,
    c_ind_op: str,
    prestador_ibge: str,
    servico_ibge: str,
    tomador_ibge: str,
    regra: str = "",
) -> str:
    """Município (IBGE) de incidência do IBS/CBS — ``nf/IBSCBS/cLocalidadeIncid``.

    1. ``servico.codigo_localidade_incidencia`` explícito no payload;
    2. ``provider_config.localidade_incidencia`` (prestador | prestacao | tomador);
    3. derivado do cIndOp (Anexo VII): 02xxxx imóvel → local da prestação;
       050101 → estabelecimento do fornecedor; 050102 → local da prestação;
    4. regra geral da LC 214/2025 (art. 11): domicílio do adquirente
       (tomador), com o município do prestador quando o tomador não tem
       endereço no Brasil.
    """
    explicit = digits(
        serv.get("codigo_localidade_incidencia")
        or serv.get("c_localidade_incid")
        or payload.get("codigo_localidade_incidencia")
        or payload.get("c_localidade_incid")
    )
    if len(explicit) == 7:
        return explicit
    by_rule = {"prestador": prestador_ibge, "prestacao": servico_ibge, "tomador": tomador_ibge}
    if regra in by_rule and len(by_rule[regra]) == 7:
        return by_rule[regra]
    if c_ind_op.startswith("02"):
        return servico_ibge or prestador_ibge
    if c_ind_op == "050101":
        return prestador_ibge
    if c_ind_op == "050102":
        return servico_ibge or prestador_ibge
    return tomador_ibge if len(tomador_ibge) == 7 else prestador_ibge


def build_blocks(
    payload: dict[str, Any],
    serv: dict[str, Any],
    *,
    prestador_ibge: str,
    servico_ibge: str,
    tomador_ibge: str,
    regra_localidade: str = "",
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

    c_ind_op, _ = resolve_c_ind_op(payload, serv)
    if not c_ind_op:
        raise PayloadError(
            "cIndOp ausente: com IBS/CBS informado a IPM exige o indicador da operação "
            "(servico.codigo_indicador_operacao, 6 dígitos, Anexo VII da NFS-e Nacional)."
        )

    local = localidade_incidencia(
        payload,
        serv,
        c_ind_op=c_ind_op,
        prestador_ibge=prestador_ibge,
        servico_ibge=servico_ibge,
        tomador_ibge=tomador_ibge,
        regra=regra_localidade,
    )
    if len(local) != 7:
        raise PayloadError("Não foi possível definir o município de incidência do IBS/CBS (cLocalidadeIncid).")

    nf_block = etree.Element("IBSCBS")
    etree.SubElement(nf_block, "cLocalidadeIncid").text = local

    root_block = etree.Element("IBSCBS")
    fin = text(payload.get("finalidade_emissao") or payload.get("fin_nfse") or "0")[:1] or "0"
    if fin not in {"0", "1", "2"}:
        raise PayloadError(f"finalidade_emissao (finNFSe) inválida: {fin!r}")
    ind_final = text(payload.get("consumidor_final") or payload.get("ind_final") or "0")[:1] or "0"
    if ind_final not in {"0", "1"}:
        raise PayloadError(f"consumidor_final (indFinal) deve ser 0 ou 1: {ind_final!r}")
    etree.SubElement(root_block, "finNFSe").text = fin
    etree.SubElement(root_block, "indFinal").text = ind_final
    etree.SubElement(root_block, "cIndOp").text = c_ind_op
    tp_oper = digits(serv.get("tipo_operacao") or payload.get("tipo_operacao") or serv.get("tp_oper"))
    if tp_oper:
        if tp_oper[:1] not in {"1", "2", "3", "4", "5"}:
            raise PayloadError(f"tipo_operacao (tpOper) deve ser 1 a 5: {tp_oper!r}")
        etree.SubElement(root_block, "tpOper").text = tp_oper[:1]
        ref = text(payload.get("chave_nfse_referenciada") or serv.get("chave_nfse_referenciada"))
        if ref:
            g_ref = etree.SubElement(root_block, "gRefNFSe")
            etree.SubElement(g_ref, "refNFSe").text = "".join(c for c in ref if c.isalnum())[:50]
    _append_imovel(root_block, payload, serv)
    trib = etree.SubElement(etree.SubElement(root_block, "valores"), "trib")
    g = etree.SubElement(trib, "gIBSCBS")
    etree.SubElement(g, "CST").text = cst
    etree.SubElement(g, "cClassTrib").text = c_class
    return nf_block, root_block


def _append_imovel(parent: etree._Element, payload: dict[str, Any], serv: dict[str, Any]) -> None:
    """``imovel`` (obrigatório na IPM para cIndOp 020101/020201/020301)."""
    im = serv.get("imovel") or payload.get("imovel")
    if not isinstance(im, dict):
        return
    el = etree.SubElement(parent, "imovel")
    insc = text(im.get("inscricao_imobiliaria") or im.get("inscImobFisc"))
    if insc:
        etree.SubElement(el, "inscImobFisc").text = insc[:30]
    cib = text(im.get("cib") or im.get("cCIB"))
    if cib:
        etree.SubElement(el, "cCIB").text = cib[:8]
        return
    end = im.get("endereco") if isinstance(im.get("endereco"), dict) else im
    e = etree.SubElement(el, "end")
    etree.SubElement(e, "CEP").text = digits(end.get("cep"))[:8]
    etree.SubElement(e, "xLgr").text = text(end.get("logradouro"))[:255]
    etree.SubElement(e, "nro").text = (text(end.get("numero")) or "SN")[:60]
    if text(end.get("complemento")):
        etree.SubElement(e, "xCpl").text = text(end.get("complemento"))[:255]
    etree.SubElement(e, "xBairro").text = text(end.get("bairro"))[:60]


# --------------------------------------------------------------------------- retorno


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _child(parent: etree._Element | None, name: str) -> etree._Element | None:
    if parent is None:
        return None
    for c in parent:
        if isinstance(c.tag, str) and _local(c) == name:
            return c
    return None


def _txt(parent: etree._Element | None, *names: str) -> str:
    node = parent
    for n in names:
        node = _child(node, n)
        if node is None:
            return ""
    raw = (node.text or "").strip()
    # IPM usa vírgula decimal; o backend recebe ponto (mesmo formato da SEFIN).
    if raw and "," in raw and raw.replace(".", "").replace(",", "").lstrip("-").isdigit():
        raw = raw.replace(".", "").replace(",", ".")
    return raw


def extract_return_ibscbs(root: etree._Element | None) -> dict[str, Any] | None:
    """IBS/CBS calculado pela IPM (retorno completo), nas chaves do Go
    ``fiscal.NFSeIBSCBSResult``. None quando o retorno não traz valores."""
    if root is None:
        return None
    nfse = root if _local(root) == "nfse" else _child(root, "nfse")
    nf = _child(nfse, "nf")
    ibs = _child(nf, "IBSCBS")
    if ibs is None:
        return None
    valores = _child(ibs, "valores")
    tot = _child(ibs, "totCIBS")
    clas = _child(_child(_child(_child(nfse, "IBSCBS"), "valores"), "trib"), "gIBSCBS")
    out = {
        "cst": _txt(clas, "CST"),
        "c_class_trib": _txt(clas, "cClassTrib"),
        "c_ind_op": _txt(_child(nfse, "IBSCBS"), "cIndOp"),
        "c_localidade_incid": _txt(ibs, "cLocalidadeIncid"),
        "v_bc": _txt(valores, "vBC"),
        "p_ibs_uf": _txt(valores, "uf", "pIBSUF"),
        "p_red_aliq_uf": _txt(valores, "uf", "pRedAliqUF"),
        "p_aliq_efet_uf": _txt(valores, "uf", "pAliqEfetUF"),
        "p_ibs_mun": _txt(valores, "mun", "pIBSMun"),
        "p_red_aliq_mun": _txt(valores, "mun", "pRedAliqMun"),
        "p_aliq_efet_mun": _txt(valores, "mun", "pAliqEfetMun"),
        "p_cbs": _txt(valores, "fed", "pCBS"),
        "p_red_aliq_cbs": _txt(valores, "fed", "pRedAliqCBS"),
        "p_aliq_efet_cbs": _txt(valores, "fed", "pAliqEfetCBS"),
        "v_ibs_uf": _txt(tot, "gIBS", "gIBSUFTot", "vIBSUF"),
        # NTE v1.7 lista vIBSMun direto em gIBS; aceita também gIBSMunTot.
        "v_ibs_mun": _txt(tot, "gIBS", "vIBSMun") or _txt(tot, "gIBS", "gIBSMunTot", "vIBSMun"),
        "v_ibs": _txt(tot, "gIBS", "vIBSTot"),
        "v_cbs": _txt(tot, "gCBS", "vCBS"),
        "v_tot_nf": _txt(tot, "vTotNF"),
    }
    cleaned = {k: v for k, v in out.items() if v}
    if not any(k in cleaned for k in ("v_bc", "v_ibs_uf", "v_ibs_mun", "v_ibs", "v_cbs", "v_tot_nf")):
        return None
    return cleaned
