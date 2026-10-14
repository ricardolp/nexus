"""JSON canônico de NFS-e (contrato Focus/SAP) → XML do webservice IPM.

Layout: IPM NTE 35/2021 v2.8 (emissão/cancelamento; manual de Garuva) +
NTE 122/2025 v1.7 de 12/08/2026 (IBS/CBS, PIS/COFINS próprio, NBS).
Uma nota por XML, raiz ``<nfse>``, sem namespace, valores com vírgula
decimal e datas ``dd/mm/aaaa``. Cidades pelo código TOM (não IBGE).

Particularidades de cada município entram por ``provider_config`` (ver
``IpmConfig``), nunca por campo novo no contrato da API.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from lxml import etree

from nfe_gateway.nfse.providers.base import ProviderConfigError
from nfe_gateway.nfse.providers.ipm import ibscbs as ipm_ibscbs
from nfe_gateway.nfse.providers.ipm.ibscbs import money, rate
from nfe_gateway.nfse.providers.municipios import ibge_to_tom
from nfe_gateway.nfse.providers.payload import (
    PayloadError,
    boolish,
    decimal,
    digits,
    endereco,
    first,
    normalize_item_lista,
    parse_emission,
    percent_points,
    present,
    prestador,
    prestador_municipio,
    round2,
    servico,
    servico_municipio,
    text,
    tomador,
)

_ZERO = Decimal(0)


@dataclass(frozen=True)
class IpmConfig:
    base_url: str
    serie_nfse: str = "1"
    item_lista_format: str = "lc116"
    assinatura: bool = False
    enviar_rps: bool = False
    ibscbs: bool = True
    timeout_seconds: float = 60.0
    # Campo multipart do XML: o exemplo PHP da NTE 35 usa "xml" e o roteiro
    # Postman usa "File"; o webservice lê o arquivo enviado.
    file_field: str = "xml"
    unidade_codigo: str = ""
    # Município de incidência do IBS/CBS quando o payload não informa:
    # "" (derivado do cIndOp / domicílio do tomador) | prestador | prestacao | tomador
    localidade_incidencia: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> IpmConfig:
        raw = raw or {}
        base_url = text(raw.get("base_url"))
        if not base_url:
            raise ProviderConfigError(
                "provider_config.base_url é obrigatório para o provedor IPM "
                "(ex.: https://ws-<cidade>.atende.net/?pg=rest&service=WNERestServiceNFSe — NTE 35/2021 §3.1)."
            )
        fmt = text(raw.get("item_lista_format") or "lc116")
        if fmt not in {"lc116", "nacional_6"}:
            raise ProviderConfigError("provider_config.item_lista_format deve ser 'lc116' ou 'nacional_6'.")
        return cls(
            base_url=base_url,
            serie_nfse=text(raw.get("serie_nfse") or "1"),
            item_lista_format=fmt,
            assinatura=boolish(raw.get("assinatura")),
            enviar_rps=boolish(raw.get("enviar_rps")),
            ibscbs=boolish(raw.get("ibscbs", True)),
            timeout_seconds=float(raw.get("timeout_seconds") or 60),
            file_field=text(raw.get("file_field") or "xml"),
            unidade_codigo=digits(raw.get("unidade_codigo")),
            localidade_incidencia=text(raw.get("localidade_incidencia")).lower(),
        )


def _sub(parent: etree._Element, tag: str, value: str | None = None) -> etree._Element:
    el = etree.SubElement(parent, tag)
    if value is not None:
        el.text = value
    return el


def _opt(parent: etree._Element, tag: str, value: str, limit: int | None = None) -> None:
    if value:
        _sub(parent, tag, value[:limit] if limit else value)


def free_text(value: Any) -> str:
    """Texto livre: a IPM não aceita "/" (NTE 35/2021 §3.2)."""
    return text(value).replace("/", "-")


_TEXT_NODE = re.compile(rb">([^<]+)<")


def serialize(root: etree._Element) -> bytes:
    """XML final com aspas escapadas em texto (&apos; / &quot;), como a IPM pede.

    lxml já escapa &, < e >; aspas em nós de texto ficam literais, então são
    trocadas só entre tags (atributos e declaração não são tocados).
    """
    raw = etree.tostring(root, xml_declaration=True, encoding="UTF-8")

    def _esc(m: re.Match[bytes]) -> bytes:
        return b">" + m.group(1).replace(b"'", b"&apos;").replace(b'"', b"&quot;") + b"<"

    return _TEXT_NODE.sub(_esc, raw)


def _date(dt: Any) -> str:
    return dt.strftime("%d/%m/%Y")


def _tom(ibge: str, *, field: str) -> str:
    tom = ibge_to_tom(ibge)
    if not tom:
        raise PayloadError(f"{field}: código IBGE {ibge or '(vazio)'} sem código TOM correspondente.")
    return tom


def _split_phone(raw: Any) -> tuple[str, str]:
    d = digits(raw)
    if d.startswith("55") and len(d) >= 12:
        d = d[2:]
    if len(d) >= 10:
        return d[:2], d[2:][-9:]
    if 6 <= len(d) <= 9:
        return "", d
    return "", ""


def situacao_tributaria(payload: dict[str, Any], serv: dict[str, Any]) -> str:
    """Código IPM (NTE 35/2021 §4.8).

    ``servico.situacao_tributaria`` explícito tem prioridade. Senão, deriva de
    natureza_operacao (Focus: 3 isenção, 4 imune) e iss_retido (retido → 2
    TIST, substituição tributária com tomador não público).
    """
    explicit = digits(serv.get("situacao_tributaria") or payload.get("situacao_tributaria"))
    if explicit:
        return explicit
    natureza = text(payload.get("natureza_operacao"))
    if natureza == "3":
        return "6"
    if natureza == "4":
        return "7"
    if boolish(serv.get("iss_retido")):
        return "2"
    return "0"


def tributa_municipio_prestador(payload: dict[str, Any], serv: dict[str, Any]) -> str:
    explicit = text(serv.get("tributa_municipio_prestador"))
    if explicit:
        return "S" if boolish(explicit) else "N"
    return "N" if text(payload.get("natureza_operacao")) == "2" else "S"


def _append_tomador(root: etree._Element, toma: dict[str, Any]) -> None:
    el = _sub(root, "tomador")
    end = endereco(toma)
    cnpj = digits(toma.get("cnpj"))
    cpf = digits(toma.get("cpf"))
    nif = text(toma.get("nif") or toma.get("identificador_estrangeiro") or toma.get("id_estrangeiro"))
    if cnpj:
        tipo = "J"
    elif cpf:
        tipo = "F"
    elif nif:
        tipo = "E"
    else:
        raise PayloadError("tomador.cnpj ou tomador.cpf é obrigatório na IPM (ou tomador.nif para estrangeiro).")

    has_end = bool(text(end.get("logradouro")))
    _sub(el, "endereco_informado", "S" if has_end else "N")
    _sub(el, "tipo", tipo)
    if tipo == "E":
        _sub(el, "identificador", nif[:20])
        _opt(el, "estado", text(end.get("estado") or end.get("uf")), 100)
        _opt(el, "pais", text(end.get("pais") or end.get("nome_pais")), 100)
    else:
        _sub(el, "cpfcnpj", cnpj or cpf)
    _opt(el, "ie", digits(toma.get("inscricao_estadual")), 16)
    nome = free_text(toma.get("razao_social") or toma.get("nome"))
    if not nome:
        raise PayloadError("tomador.razao_social é obrigatório na IPM.")
    _sub(el, "nome_razao_social", nome[:100])
    _opt(el, "sobrenome_nome_fantasia", free_text(toma.get("nome_fantasia")), 100)
    if has_end:
        _sub(el, "logradouro", free_text(end.get("logradouro"))[:70])
        _opt(el, "email", text(toma.get("email")), 100)
        _sub(el, "numero_residencia", (free_text(end.get("numero")) or "SN")[:8])
        _opt(el, "complemento", free_text(end.get("complemento")), 50)
        _opt(el, "ponto_referencia", free_text(end.get("ponto_referencia")), 100)
        _opt(el, "bairro", free_text(end.get("bairro")), 30)
        if tipo == "E":
            _opt(el, "cidade", text(end.get("cidade") or end.get("nome_municipio")), 100)
        else:
            ibge = digits(end.get("codigo_municipio"))
            _sub(el, "cidade", _tom(ibge, field="tomador.endereco.codigo_municipio"))
        _opt(el, "cep", digits(end.get("cep")), 8)
    else:
        _opt(el, "email", text(toma.get("email")), 100)
    ddd, fone = _split_phone(toma.get("telefone"))
    if fone:
        _opt(el, "ddd_fone_comercial", ddd, 3)
        _sub(el, "fone_comercial", fone)


def _pis_cofins_rate(value: Any, *, field: str) -> Decimal:
    """Alíquota de PIS/COFINS em pontos percentuais.

    Fração (0,0065 / 0,03 / 0,076) e percentual (0,65 / 3 / 7,6) não se
    sobrepõem para PIS/COFINS: abaixo de 0,1 é fração.
    """
    d = decimal(value, field=field)
    return d * 100 if d < Decimal("0.1") else d


def _append_pis_cofins(nf: etree._Element, payload: dict[str, Any], serv: dict[str, Any], *, valor_servicos: Decimal) -> None:
    """``nf/pis_cofins`` (NTE 122 v1.7): CST, base e alíquotas do PIS/COFINS próprio."""
    cst = digits(serv.get("situacao_tributaria_pis_cofins") or payload.get("situacao_tributaria_pis_cofins"))
    if not cst:
        return
    group = _sub(nf, "pis_cofins")
    _sub(group, "cst", cst[:2].zfill(2))
    base_raw = first([serv, payload], "base_calculo_pis_cofins", "base_calculo_pis", "base_pis_cofins")
    base = decimal(base_raw, field="base_calculo_pis_cofins") if base_raw is not None else valor_servicos
    _sub(group, "base_calculo", money(base))
    p_pis = first([serv, payload], "aliquota_pis")
    p_cofins = first([serv, payload], "aliquota_cofins")
    _sub(group, "aliquota_pis", rate(_pis_cofins_rate(p_pis, field="aliquota_pis")) if p_pis is not None else "0,00")
    _sub(group, "aliquota_cofins", rate(_pis_cofins_rate(p_cofins, field="aliquota_cofins")) if p_cofins is not None else "0,00")


def content_identifier(document_id: str, xml_without_id: bytes) -> str:
    """``<identificador>``: a IPM não reprocessa um identificador já usado.

    Mesmo documento + mesmo conteúdo (retry após timeout) → mesmo
    identificador, e a IPM devolve a nota já emitida. Conteúdo corrigido
    após rejeição → identificador novo.
    """
    digest = hashlib.sha256(xml_without_id).hexdigest()[:16]
    doc = "".join(c for c in (document_id or "sem-documento") if c.isalnum() or c == "-")
    return f"nexus-{doc}-{digest}"[:80]


@dataclass
class IpmEmission:
    root: etree._Element
    identificador: str

    def to_bytes(self) -> bytes:
        return serialize(self.root)


def build_emission(
    payload: dict[str, Any],
    cfg: IpmConfig,
    *,
    homologacao: bool,
    document_id: str = "",
) -> IpmEmission:
    prest = prestador(payload)
    toma = tomador(payload)
    serv = servico(payload)

    cnpj = digits(prest.get("cnpj"))
    if len(cnpj) != 14:
        raise PayloadError("prestador.cnpj deve ter 14 dígitos")
    prest_tom = _tom(prestador_municipio(payload), field="prestador.codigo_municipio")
    local_tom = _tom(servico_municipio(payload), field="servico.codigo_municipio")
    emissao = parse_emission(payload.get("data_emissao"))

    if not present(serv.get("valor_servicos")):
        raise PayloadError("servico.valor_servicos é obrigatório")
    valor_servicos = decimal(serv.get("valor_servicos"), field="valor_servicos")
    desc_incond = decimal(serv.get("desconto_incondicionado"), field="desconto_incondicionado")
    desc_cond = decimal(serv.get("desconto_condicionado"), field="desconto_condicionado")
    deducoes = decimal(serv.get("valor_deducoes"), field="valor_deducoes")
    v_pis = decimal(serv.get("valor_pis"), field="valor_pis")
    v_cofins = decimal(serv.get("valor_cofins"), field="valor_cofins")
    v_ir = decimal(serv.get("valor_ir"), field="valor_ir")
    v_inss = decimal(serv.get("valor_inss"), field="valor_inss")
    v_csll = decimal(serv.get("valor_csll"), field="valor_csll")

    aliquota = percent_points(serv.get("aliquota"), field="aliquota") if present(serv.get("aliquota")) else None
    iss_retido = boolish(serv.get("iss_retido"))
    base_iss = valor_servicos - deducoes - desc_incond
    if present(serv.get("valor_iss")):
        valor_iss = decimal(serv.get("valor_iss"), field="valor_iss")
    elif aliquota is not None:
        valor_iss = round2(base_iss * aliquota / 100)
    else:
        valor_iss = _ZERO
    if iss_retido:
        v_issrf = (
            decimal(serv.get("valor_iss_retido"), field="valor_iss_retido")
            if present(serv.get("valor_iss_retido")) and decimal(serv.get("valor_iss_retido")) != 0
            else valor_iss
        )
    else:
        v_issrf = _ZERO

    root = etree.Element("nfse")
    if cfg.assinatura:
        root.set("id", "nota")
    if homologacao:
        _sub(root, "nfse_teste", "1")
    id_el = _sub(root, "identificador", "")

    if cfg.enviar_rps:
        numero_rps = digits(payload.get("numero_rps"))
        serie_rps = digits(payload.get("serie_rps"))
        if not numero_rps:
            raise PayloadError("numero_rps é obrigatório quando o município usa RPS (provider_config.enviar_rps)")
        rps = _sub(root, "rps")
        _sub(rps, "nro_recibo_provisorio", numero_rps.lstrip("0") or "0")
        _sub(rps, "serie_recibo_provisorio", (serie_rps or "1")[:2])
        _sub(rps, "data_emissao_recibo_provisorio", _date(emissao))
        _sub(rps, "hora_emissao_recibo_provisorio", emissao.strftime("%H:%M:%S"))

    retencao_pis_cofins = text(
        serv.get("tipo_retencao_pis_cofins") or payload.get("tipo_retencao_pis_cofins")
    ) == "1"

    nf = _sub(root, "nf")
    _sub(nf, "serie_nfse", digits(payload.get("serie_nfse")) or cfg.serie_nfse)
    _sub(nf, "data_fato_gerador", _date(emissao))
    _sub(nf, "valor_total", money(valor_servicos))
    # nf/valor_desconto só assinala (não mexe na base): é o condicionado.
    # O incondicionado vai no item (valor_desconto_incondicional).
    _sub(nf, "valor_desconto", money(desc_cond))
    _sub(nf, "valor_ir", money(v_ir))
    _sub(nf, "valor_inss", money(v_inss))
    _sub(nf, "valor_contribuicao_social", money(v_csll))
    _append_pis_cofins(nf, payload, serv, valor_servicos=valor_servicos)
    # NTE 122 v1.7: valor_pis / valor_cofins são só as RETENÇÕES (descontam do
    # líquido). PIS/COFINS próprio vai em pis_cofins (deduz da base do IBS/CBS).
    if retencao_pis_cofins:
        _sub(nf, "valor_pis", money(v_pis))
        _sub(nf, "valor_cofins", money(v_cofins))
    obs = text(
        first([payload, serv], "informacoes_complementares", "observacao", "observacoes")
    )
    _opt(nf, "observacao", free_text(obs), 1000)

    blocks = None
    if cfg.ibscbs:
        toma_end = endereco(toma)
        blocks = ipm_ibscbs.build_blocks(
            payload,
            serv,
            prestador_ibge=prestador_municipio(payload),
            servico_ibge=servico_municipio(payload),
            tomador_ibge=digits(toma_end.get("codigo_municipio")),
            regra_localidade=cfg.localidade_incidencia,
        )
        if blocks:
            nf.append(blocks[0])

    prest_el = _sub(root, "prestador")
    _sub(prest_el, "cpfcnpj", cnpj)
    _sub(prest_el, "cidade", prest_tom)

    _append_tomador(root, toma)

    itens = _sub(root, "itens")
    lista = _sub(itens, "lista")
    _sub(lista, "codigo_local_prestacao_servico", local_tom)
    if cfg.unidade_codigo:
        _sub(lista, "unidade_codigo", cfg.unidade_codigo)
        _sub(lista, "unidade_quantidade", "1,00")
        _sub(lista, "unidade_valor_unitario", money(valor_servicos))
    _sub(
        lista,
        "codigo_item_lista_servico",
        normalize_item_lista(serv.get("item_lista_servico"), fmt=cfg.item_lista_format),
    )
    nbs = digits(serv.get("codigo_nbs"))
    if len(nbs) != 9:
        raise PayloadError(
            "servico.codigo_nbs é obrigatório na IPM (NBS com 9 dígitos, ex.: 1.1501.10.00); "
            f"recebido {serv.get('codigo_nbs')!r}."
        )
    _sub(lista, "codigo_nbs", nbs)
    atividade = digits(serv.get("codigo_tributario_municipio") or serv.get("codigo_tributacao_municipio"))
    _opt(lista, "codigo_atividade", atividade, 9)
    descritivo = text(serv.get("discriminacao"))
    if not descritivo:
        raise PayloadError("servico.discriminacao é obrigatória")
    _sub(lista, "descritivo", free_text(descritivo)[:1000])
    if aliquota is None:
        raise PayloadError("servico.aliquota (ISS) é obrigatória na IPM.")
    _sub(lista, "aliquota_item_lista_servico", rate(aliquota))
    _sub(lista, "situacao_tributaria", situacao_tributaria(payload, serv))
    _sub(lista, "valor_tributavel", money(valor_servicos))
    _sub(lista, "valor_deducao", money(deducoes))
    _sub(lista, "valor_issrf", money(v_issrf))
    if desc_incond:
        _sub(lista, "valor_desconto_incondicional", money(desc_incond))
    _sub(lista, "tributa_municipio_prestador", tributa_municipio_prestador(payload, serv))

    if blocks:
        root.append(blocks[1])

    unsigned = etree.tostring(root, encoding="UTF-8")
    identificador = content_identifier(document_id, unsigned)
    id_el.text = identificador
    return IpmEmission(root=root, identificador=identificador)


def build_cancel(
    *,
    cnpj: str,
    municipality_ibge: str,
    nfse_number: str,
    nfse_series: str,
    motivo: str,
    cfg: IpmConfig,
) -> etree._Element:
    numero = digits(nfse_number)
    if not numero:
        raise PayloadError("Cancelamento IPM exige o número da NFS-e.")
    if len(digits(cnpj)) != 14:
        raise PayloadError("Cancelamento IPM exige o CNPJ do prestador.")
    obs = free_text(motivo)
    if len(obs) < 15:
        raise PayloadError("Justificativa do cancelamento deve ter ao menos 15 caracteres.")
    root = etree.Element("nfse")
    if cfg.assinatura:
        root.set("id", "nota")
    nf = _sub(root, "nf")
    _sub(nf, "numero", numero.lstrip("0") or "0")
    _sub(nf, "serie_nfse", digits(nfse_series) or cfg.serie_nfse)
    _sub(nf, "situacao", "C")
    _sub(nf, "observacao", obs[:1000])
    prest = _sub(root, "prestador")
    _sub(prest, "cpfcnpj", digits(cnpj))
    _sub(prest, "cidade", _tom(municipality_ibge, field="municipality_code"))
    return root
