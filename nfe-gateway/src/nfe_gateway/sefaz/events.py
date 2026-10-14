"""SEFAZ event builders: cancelamento, carta de correção, inutilização."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from lxml import etree

NFE_NS = "http://www.portalfiscal.inf.br/nfe"
BRASILIA = timezone(timedelta(hours=-3))


def _ns(tag: str) -> str:
    return f"{{{NFE_NS}}}{tag}"


def _now_brasilia() -> datetime:
    return datetime.now(BRASILIA)


def build_cancel_evento(
    *,
    chave: str,
    protocolo: str,
    cnpj: str,
    justificativa: str,
    homologacao: bool,
    n_seq: int = 1,
) -> etree._Element:
    if len(justificativa.strip()) < 15:
        raise ValueError("cancel justificativa must be at least 15 characters")
    protocolo = str(protocolo).zfill(15)[-15:]
    tp_amb = "2" if homologacao else "1"
    dh = _now_brasilia().strftime("%Y-%m-%dT%H:%M:%S-03:00")
    id_evento = f"ID110111{chave}{n_seq:02d}"

    root = etree.Element(_ns("evento"), nsmap={None: NFE_NS}, versao="1.00")
    inf = etree.SubElement(root, _ns("infEvento"), Id=id_evento)
    etree.SubElement(inf, _ns("cOrgao")).text = chave[:2]
    etree.SubElement(inf, _ns("tpAmb")).text = tp_amb
    etree.SubElement(inf, _ns("CNPJ")).text = "".join(c for c in cnpj if c.isdigit())
    etree.SubElement(inf, _ns("chNFe")).text = chave
    etree.SubElement(inf, _ns("dhEvento")).text = dh
    etree.SubElement(inf, _ns("tpEvento")).text = "110111"
    etree.SubElement(inf, _ns("nSeqEvento")).text = str(n_seq)
    etree.SubElement(inf, _ns("verEvento")).text = "1.00"
    det = etree.SubElement(inf, _ns("detEvento"), versao="1.00")
    etree.SubElement(det, _ns("descEvento")).text = "Cancelamento"
    etree.SubElement(det, _ns("nProt")).text = protocolo
    etree.SubElement(det, _ns("xJust")).text = justificativa.strip()
    return root


def build_cce_evento(
    *,
    chave: str,
    cnpj: str,
    correcao: str,
    homologacao: bool,
    n_seq: int = 1,
) -> etree._Element:
    if len(correcao.strip()) < 15:
        raise ValueError("carta de correção text must be at least 15 characters")
    tp_amb = "2" if homologacao else "1"
    dh = _now_brasilia().strftime("%Y-%m-%dT%H:%M:%S-03:00")
    id_evento = f"ID110110{chave}{n_seq:02d}"

    root = etree.Element(_ns("evento"), nsmap={None: NFE_NS}, versao="1.00")
    inf = etree.SubElement(root, _ns("infEvento"), Id=id_evento)
    etree.SubElement(inf, _ns("cOrgao")).text = chave[:2]
    etree.SubElement(inf, _ns("tpAmb")).text = tp_amb
    etree.SubElement(inf, _ns("CNPJ")).text = "".join(c for c in cnpj if c.isdigit())
    etree.SubElement(inf, _ns("chNFe")).text = chave
    etree.SubElement(inf, _ns("dhEvento")).text = dh
    etree.SubElement(inf, _ns("tpEvento")).text = "110110"
    etree.SubElement(inf, _ns("nSeqEvento")).text = str(n_seq)
    etree.SubElement(inf, _ns("verEvento")).text = "1.00"
    det = etree.SubElement(inf, _ns("detEvento"), versao="1.00")
    etree.SubElement(det, _ns("descEvento")).text = "Carta de Correcao"
    etree.SubElement(det, _ns("xCorrecao")).text = correcao.strip()
    etree.SubElement(det, _ns("xCondUso")).text = (
        "A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, "
        "de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido "
        "na emissao de documento fiscal, desde que o erro nao esteja relacionado com: "
        "I - as variaveis que determinam o valor do imposto tais como: base de calculo, "
        "aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; "
        "II - a correcao de dados cadastrais que implique mudanca do remetente ou do "
        "destinatario; III - a data de emissao ou de saida."
    )
    return root


def parse_evento_cstat(response_xml: bytes) -> dict[str, Any]:
    root = etree.fromstring(response_xml)
    # retEnvEvento carries a batch-level cStat (128 = lote processado); the
    # event outcome lives in retEvento/infEvento.
    for el in root.iter():
        if etree.QName(el).localname == "infEvento":
            root = el
            break

    def find_text(*names: str) -> str | None:
        for el in root.iter():
            if etree.QName(el).localname in names and el.text:
                return el.text
        return None

    cstat = find_text("cStat") or ""
    return {
        "cstat": cstat,
        "x_motivo": find_text("xMotivo") or "",
        "protocol": find_text("nProt"),
        "outcome": "accepted" if cstat in ("135", "136", "155") else "rejected",
    }
