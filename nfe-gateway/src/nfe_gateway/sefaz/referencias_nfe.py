"""Documentos referenciados na NF-e e grupos de referência da Reforma Tributária.

- ``ide/NFref``: notas referenciadas (``notas_referenciadas`` do SAP) —
  refNFe / refCTe por chave, refNF (modelo 01/02) por dados.
- ``det/DFeReferenciado``: referência por item (``chave_acesso_dfe_referenciado``
  + ``numero_item_dfe_referenciado``), NT 2025.002-RTC v1.50.
- ``ide/gCompraGov`` e ``ide/gPagAntecipado`` (compras governamentais e
  pagamento antecipado).

Devolução (finNFe=4), regra VC02-14 da NT 2025.002 v1.52: a partir da data de
corte, a devolução referencia o documento de origem **por item** em
DFeReferenciado e não pode usar refNFe no cabeçalho (rejeição 321). Antes do
corte, refNFe continua saindo. Datas de corte (comunicado ENCAT de 05/10/2026):
homologação 26/10/2026, produção 16/11/2026 — ajustáveis por variável de
ambiente sem novo deploy de código.
"""

from __future__ import annotations

import os
from datetime import date
from typing import Any

from lxml import etree

NFE_NS = "http://www.portalfiscal.inf.br/nfe"

_DEFAULT_CORTE_PRODUCAO = date(2026, 11, 16)
_DEFAULT_CORTE_HOMOLOGACAO = date(2026, 10, 26)

_UF_IBGE = {
    "RO": "11", "AC": "12", "AM": "13", "RR": "14", "PA": "15", "AP": "16", "TO": "17",
    "MA": "21", "PI": "22", "CE": "23", "RN": "24", "PB": "25", "PE": "26", "AL": "27",
    "SE": "28", "BA": "29", "MG": "31", "ES": "32", "RJ": "33", "SP": "35", "PR": "41",
    "SC": "42", "RS": "43", "MS": "50", "MT": "51", "GO": "52", "DF": "53",
}


class ReferenciaMapperError(ValueError):
    """Referência a documento fiscal impossível de montar com os dados do SAP."""


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _child(parent: etree._Element | None, name: str) -> etree._Element | None:
    if parent is None:
        return None
    for c in parent:
        if isinstance(c.tag, str) and _local(c) == name:
            return c
    return None


def _qn(parent: etree._Element, local: str) -> str:
    return f"{{{etree.QName(parent).namespace or NFE_NS}}}{local}"


def _el(parent: etree._Element, local: str, text: str | None = None) -> etree._Element:
    el = etree.Element(_qn(parent, local))
    if text is not None:
        el.text = text
    return el


def _sub(parent: etree._Element, local: str, text: str | None = None) -> etree._Element:
    el = etree.SubElement(parent, _qn(parent, local))
    if text is not None:
        el.text = text
    return el


def _get(d: dict, *keys: str) -> Any:
    lowered = {str(k).lower(): v for k, v in d.items()}
    for key in keys:
        v = lowered.get(key.lower())
        if v is not None and str(v).strip() != "":
            return v
    return None


def _txt(d: dict, *keys: str) -> str:
    v = _get(d, *keys)
    return "" if v is None else str(v).strip()


def _digits(v: Any) -> str:
    return "".join(ch for ch in str(v or "") if ch.isdigit())


def _chave(v: Any) -> str:
    """Chave de acesso de 44 posições (aceita CNPJ alfanumérico nas posições 7–18)."""
    return "".join(ch for ch in str(v or "") if ch.isalnum()).upper()


def _valid_chave(chave: str) -> bool:
    return (
        len(chave) == 44
        and chave[:6].isdigit()
        and chave[6:18].isalnum()
        and chave[18:].isdigit()
    )


def _items(sap: dict) -> list[dict]:
    return [i for i in (_get(sap, "items") or []) if isinstance(i, dict)]


def _list(sap: dict, *keys: str) -> list[Any]:
    v = _get(sap, *keys)
    return v if isinstance(v, list) else []


# --------------------------------------------------------------------------- #
# Datas de corte da devolução por item
# --------------------------------------------------------------------------- #


def _env_date(name: str, default: date) -> date:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return default


def devolucao_por_item_ativa(*, homologacao: bool, emissao: date) -> bool:
    """VC02-14: a devolução passa a exigir DFeReferenciado e proíbe refNFe."""
    if homologacao:
        corte = _env_date("NFE_DEVOLUCAO_POR_ITEM_HOMOLOGACAO", _DEFAULT_CORTE_HOMOLOGACAO)
    else:
        corte = _env_date("NFE_DEVOLUCAO_POR_ITEM_PRODUCAO", _DEFAULT_CORTE_PRODUCAO)
    return emissao >= corte


def _ide_info(xml: etree._Element) -> tuple[etree._Element | None, etree._Element | None, bool, date, str]:
    inf = next((el for el in xml.iter() if isinstance(el.tag, str) and _local(el) == "infNFe"), None)
    ide = _child(inf, "ide")
    homolog = (_child(ide, "tpAmb").text or "").strip() == "2" if _child(ide, "tpAmb") is not None else True
    emissao = date.today()
    dh = _child(ide, "dhEmi")
    if dh is not None and dh.text:
        try:
            emissao = date.fromisoformat(dh.text.strip()[:10])
        except ValueError:
            pass
    fin_el = _child(ide, "finNFe")
    fin = (fin_el.text or "").strip() if fin_el is not None else ""
    return inf, ide, homolog, emissao, fin


# --------------------------------------------------------------------------- #
# ide: NFref, gCompraGov, gPagAntecipado
# --------------------------------------------------------------------------- #


def _aamm(raw: str) -> str:
    digits = _digits(raw)
    if len(digits) == 6:  # AAAAMM
        return digits[2:]
    if len(digits) == 8:  # AAAAMMDD
        return digits[2:6]
    if len(digits) == 4:  # AAMM
        return digits
    raise ReferenciaMapperError(f"notas_referenciadas.ano_mes inválido: {raw!r} (use AAAA-MM).")


def _build_nfref(ide: etree._Element, ref: dict, *, sem_ref_nfe: bool) -> etree._Element | None:
    chave = _chave(_get(ref, "chave_acesso", "chave_nfe", "chave"))
    if chave:
        if not _valid_chave(chave):
            raise ReferenciaMapperError(f"notas_referenciadas: chave de acesso inválida {chave!r}.")
        modelo = chave[20:22]
        nfref = _el(ide, "NFref")
        if modelo in ("57", "67"):
            _sub(nfref, "refCTe", chave)
            return nfref
        if sem_ref_nfe:
            return None  # devolução: vai por item em DFeReferenciado
        _sub(nfref, "refNFe", chave)
        return nfref

    modelo = _digits(_txt(ref, "modelo")).zfill(2) if _txt(ref, "modelo") else ""
    if modelo in ("01", "02"):
        uf = _txt(ref, "uf").upper()
        c_uf = _UF_IBGE.get(uf, _digits(uf) if len(_digits(uf)) == 2 else "")
        cnpj = _digits(_txt(ref, "cnpj"))
        serie = _digits(_txt(ref, "serie"))
        numero = _digits(_txt(ref, "numero"))
        ano_mes = _txt(ref, "ano_mes")
        if not (c_uf and cnpj and serie and numero and ano_mes):
            raise ReferenciaMapperError(
                "notas_referenciadas: nota modelo 01/02 exige uf, ano_mes, cnpj, serie e numero."
            )
        nfref = _el(ide, "NFref")
        ref_nf = _sub(nfref, "refNF")
        _sub(ref_nf, "cUF", c_uf)
        _sub(ref_nf, "AAMM", _aamm(ano_mes))
        _sub(ref_nf, "CNPJ", cnpj.zfill(14)[-14:])
        _sub(ref_nf, "mod", modelo)
        _sub(ref_nf, "serie", str(int(serie)))
        _sub(ref_nf, "nNF", str(int(numero)))
        return nfref
    if not modelo and not chave:
        return None
    raise ReferenciaMapperError(
        f"notas_referenciadas: modelo {modelo or '?'} sem chave de acesso não é suportado "
        "(informe chave_acesso; nota de produtor modelo 04 e cupom fiscal exigem campos fora do contrato)."
    )


def _insert_after(anchor: etree._Element, new: etree._Element) -> etree._Element:
    anchor.addnext(new)
    return new


def patch_ide_referencias(xml: etree._Element, sap: dict[str, Any]) -> None:
    """Monta ide/NFref*, ide/gCompraGov e ide/gPagAntecipado a partir do SAP."""
    inf, ide, homolog, emissao, fin = _ide_info(xml)
    if ide is None:
        return
    for name in ("NFref", "gCompraGov", "gPagAntecipado"):
        for old in [c for c in ide if isinstance(c.tag, str) and _local(c) == name]:
            ide.remove(old)

    # lxml elements without children are falsy — never use `or` on them.
    anchor = _child(ide, "xJust")
    if anchor is None:
        anchor = _child(ide, "verProc")
    if anchor is None:
        if not len(ide):
            return  # ide incompleto (testes / XML parcial): nada a ancorar
        anchor = ide[-1]

    sem_ref_nfe = fin == "4" and devolucao_por_item_ativa(homologacao=homolog, emissao=emissao)
    refs = [r for r in _list(sap, "notas_referenciadas") if isinstance(r, dict)]
    count = 0
    for ref in refs:
        nfref = _build_nfref(ide, ref, sem_ref_nfe=sem_ref_nfe)
        if nfref is None:
            continue
        anchor = _insert_after(anchor, nfref)
        count += 1
    if count > 999:
        raise ReferenciaMapperError("ide/NFref aceita no máximo 999 documentos referenciados.")

    tp_ente = _digits(_txt(sap, "tipo_compra_governamental", "tp_ente_gov"))
    if tp_ente and tp_ente != "0":
        if tp_ente not in {"1", "2", "3", "4", "5", "6"}:
            raise ReferenciaMapperError(f"tipo_compra_governamental (tpEnteGov) deve ser 1 a 6: {tp_ente!r}.")
        tp_oper = _digits(_txt(sap, "tipo_operacao_governamental", "tp_oper_gov"))
        if tp_oper not in {"1", "2", "3", "4"}:
            raise ReferenciaMapperError(
                f"tipo_operacao_governamental (tpOperGov) deve ser 1 a 4 em compra governamental: {tp_oper!r}."
            )
        p_red = _txt(sap, "perc_reducao_aliq_compra_gov", "percentual_reducao_compra_gov") or "0"
        gov = _el(ide, "gCompraGov")
        _sub(gov, "tpEnteGov", tp_ente)
        _sub(gov, "pRedutor", f"{float(p_red.replace(',', '.')):.4f}")
        _sub(gov, "tpOperGov", tp_oper)
        for entry in _list(sap, "chaves_acesso_dfe_anteriores")[:99]:
            chave = _chave(_get(entry, "chave_dfe", "chave_acesso") if isinstance(entry, dict) else entry)
            if chave:
                if not _valid_chave(chave):
                    raise ReferenciaMapperError(f"chaves_acesso_dfe_anteriores: chave inválida {chave!r}.")
                _sub(gov, "refDFeAnt", chave)
        anchor = _insert_after(anchor, gov)

    antecipacao = _list(sap, "chaves_nfe_antecipacao_pagamento", "chaves_nfe_antecipacao_pag")
    chaves = []
    for entry in antecipacao:
        chave = _chave(_get(entry, "chave_nfe", "chave_acesso") if isinstance(entry, dict) else entry)
        if chave:
            if not _valid_chave(chave):
                raise ReferenciaMapperError(f"chaves_nfe_antecipacao_pagamento: chave inválida {chave!r}.")
            chaves.append(chave)
    if chaves:
        if len(chaves) > 99:
            raise ReferenciaMapperError("gPagAntecipado aceita no máximo 99 chaves.")
        pag = _el(ide, "gPagAntecipado")
        for chave in chaves:
            _sub(pag, "refNFe", chave)
        _insert_after(anchor, pag)


# --------------------------------------------------------------------------- #
# det: DFeReferenciado
# --------------------------------------------------------------------------- #


def patch_dfe_referenciado(xml: etree._Element, sap: dict[str, Any]) -> None:
    """det/DFeReferenciado (chaveAcesso, nItem?) por item.

    Sai sempre que o SAP envia ``chave_acesso_dfe_referenciado`` no item. Em
    devolução (finNFe=4) após a data de corte da VC02-14, todo item precisa da
    referência: se o SAP não mandou por item e há exatamente uma NF-e em
    ``notas_referenciadas``, ela é usada para todos os itens (sem nItem).
    """
    inf, ide, homolog, emissao, fin = _ide_info(xml)
    if inf is None:
        return
    items = _items(sap)
    dets = [c for c in inf if isinstance(c.tag, str) and _local(c) == "det"]
    devolucao_por_item = fin == "4" and devolucao_por_item_ativa(homologacao=homolog, emissao=emissao)

    fallback = ""
    if devolucao_por_item:
        chaves_nfe = [
            _chave(_get(r, "chave_acesso", "chave_nfe", "chave"))
            for r in _list(sap, "notas_referenciadas") if isinstance(r, dict)
        ]
        chaves_nfe = [c for c in chaves_nfe if _valid_chave(c) and c[20:22] in ("55", "65")]
        if len(set(chaves_nfe)) == 1:
            fallback = chaves_nfe[0]

    for idx, det in enumerate(dets):
        for old in [c for c in det if isinstance(c.tag, str) and _local(c) == "DFeReferenciado"]:
            det.remove(old)
        item = items[idx] if idx < len(items) else {}
        chave = _chave(_get(item, "chave_acesso_dfe_referenciado", "chave_dfe_referenciado"))
        n_item = _digits(_txt(item, "numero_item_dfe_referenciado", "n_item_dfe_referenciado"))
        if not chave and devolucao_por_item:
            chave = fallback
            n_item = ""
        if not chave:
            if devolucao_por_item:
                label = _txt(item, "numero_item") or str(idx + 1)
                raise ReferenciaMapperError(
                    f"Item {label}: devolução (finNFe=4) exige o documento de origem por item "
                    "(chave_acesso_dfe_referenciado e numero_item_dfe_referenciado) — regra VC02-14 "
                    "da NT 2025.002; refNFe no cabeçalho deixa de ser aceito."
                )
            continue
        if not _valid_chave(chave):
            raise ReferenciaMapperError(f"chave_acesso_dfe_referenciado inválida: {chave!r}.")
        ref = _sub(det, "DFeReferenciado")  # último filho de <det>
        _sub(ref, "chaveAcesso", chave)
        if n_item and n_item.lstrip("0"):
            n = int(n_item)
            if not 1 <= n <= 990:
                raise ReferenciaMapperError(f"numero_item_dfe_referenciado deve ser 1 a 990: {n_item!r}.")
            _sub(ref, "nItem", str(n))
