"""Maps flat SAP Portuguese JSON → PyNFe NF-e entities + XML patches.

Contract: YNEX_IF_MSG_NFE (flat snake_case) — see backend/internal/fiscal/sap_outbound.go.
NOT the legacy DRC VALUES.* shape.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from lxml import etree
from pynfe.entidades.cliente import Cliente
from pynfe.entidades.emitente import Emitente
from pynfe.entidades.fonte_dados import FonteDados
from pynfe.entidades.notafiscal import NotaFiscal
from pynfe.processamento.serializacao import SerializacaoXML

from nfe_gateway.sefaz.contingency import (
    CONTINGENCIA_TP_EMIS,
    is_contingencia,
    resolve_tp_emis,
    requires_dhcont_xjust,
)
from nfe_gateway.sefaz.cnpj_doc import CnpjDocError, normalize_cnpj, normalize_cpf
from nfe_gateway.sefaz.environment import HOMOLOGACAO_DISCLAIMER
from nfe_gateway.sefaz.ibscbs_nfe import IbsCbsMapperError
from nfe_gateway.sefaz.referencias_nfe import ReferenciaMapperError
from nfe_gateway.sefaz.xml_patches import apply_all_patches

# NT 2018.003 — software house that emits the NF-e. TO rejects with cStat 972
# when infRespTec is absent. Same block GRC sends for this emitter.
_RESPONSAVEL_TECNICO = {
    "cnpj": "35934186000130",
    "contato": "Nova Consultoria em Tecnologia da Informacao Ltda",
    "email": "ti@novaconsulting.com.br",
    "fone": "4199999999",
}


_BRASILIA_TZ = timezone(timedelta(hours=-3))
_EMISSION_CLOCK_MARGIN = timedelta(seconds=60)


class SapNfeMapperError(ValueError):
    """Raised when required SAP fields are missing or malformed."""


def build_unsigned_xml(sap_json: dict, *, homologacao: bool) -> etree._Element:
    """Converts SAP JSON → unsigned PyNFe <NFe> XML element (patched)."""
    nf = _build_nota_fiscal(sap_json, homologacao=homologacao)
    fonte = FonteDados()
    fonte.adicionar_objeto(nf)
    tp_emis = resolve_tp_emis(sap_json)
    contingencia = True if requires_dhcont_xjust(tp_emis) else None
    serializer = SerializacaoXML(fonte, homologacao=homologacao, contingencia=contingencia)
    xml = serializer.exportar()
    if isinstance(xml, (bytes, str)):
        xml = etree.fromstring(xml if isinstance(xml, bytes) else xml.encode("utf-8"))
    try:
        xml = apply_all_patches(xml, sap_json)
    except (IbsCbsMapperError, ReferenciaMapperError) as exc:
        raise SapNfeMapperError(str(exc)) from exc
    # Stable default xmlns before validate/sign (tree rebuild — no string xmlns hacks).
    from nfe_gateway.sefaz.assinatura import normalize_nfe_namespaces

    return normalize_nfe_namespaces(xml)


def _build_nota_fiscal(sap: dict, homologacao: bool) -> NotaFiscal:
    nf = NotaFiscal(
        emitente=_build_emitente(sap),
        cliente=_build_destinatario(sap),
    )

    nf.modelo = 55
    nf.uf = _parse_str(sap, "uf_emitente")
    # XSD TNF: [1-9][0-9]{0,8} — SEFAZ cStat 215 rejects nNF=0.
    nf.numero_nf = _parse_nfe_number(sap, "numero")
    # XSD TSerie is "0" or 1–999 without leading zeros. SAP/GRC store "000";
    # the access key still zero-pads to 3 digits (PyNFe zfill).
    nf.serie = format_nfe_serie(_parse_str(sap, "serie"))
    nf.natureza_operacao = _parse_str(sap, "natureza_operacao")
    nf.tipo_documento = _parse_int(sap, "tipo_documento")
    # PyNFe writes dhEmi/dhSaiEnt offset from data_emissao's tzinfo and falls
    # back to the host timezone when naive — keep both aware in Brasília time.
    nf.data_emissao = _clamp_future_emission(_to_brasilia(_parse_datetime(sap, "data_emissao")))
    dh_sai_ent = _parse_datetime(sap, "data_entrada_saida", required=False)
    nf.data_saida_entrada = _to_brasilia(dh_sai_ent) if dh_sai_ent else nf.data_emissao

    if _get(sap, "codigo_unico") is not None:
        # PyNFe field for cNF
        for attr in ("codigo_numerico_aleatorio", "codigo_numerico", "numero_aleatorio"):
            if hasattr(nf, attr):
                setattr(nf, attr, str(_get(sap, "codigo_unico")).zfill(8)[:8])
                break

    tp_emis = resolve_tp_emis(sap)
    # PyNFe uses forma_emissao as tpEmis in the access key / ide
    if hasattr(nf, "forma_emissao"):
        nf.forma_emissao = str(tp_emis)
    nf.tipo_emissao = tp_emis

    fin = _parse_int(sap, "finalidade_emissao", default=1)
    nf.finalidade_emissao = fin
    # finNFe=5 (débito) → entrada
    if fin == 5:
        nf.tipo_documento = 0

    nf.cliente_final = _parse_int(sap, "consumidor_final", default=1)
    nf.indicador_presencial = _parse_int(sap, "presenca_comprador", default=1)
    nf.indicador_destino = _parse_int(sap, "local_destino", default=1)
    nf.processo_emissao = 0
    # PyNFe writes ide/tpImp from tipo_impressao_danfe (default 0, which the
    # SEFAZ schema rejects). GRC sends 1 = DANFE retrato.
    nf.tipo_impressao_danfe = 1

    cmun = _resolve_emitente_ibge(sap)
    if cmun:
        nf.municipio = cmun
    if _get(sap, "codigo_municipio_fato_gerador_ibs") and hasattr(nf, "municipio_fato_gerador_ibs"):
        # Prefer same plant IBGE when SAP left IBS FG blank / wrong for known cities.
        nf.municipio_fato_gerador_ibs = str(
            _get(sap, "codigo_municipio_fato_gerador_ibs") or cmun or ""
        )
        if cmun and str(_get(sap, "municipio_emitente") or "").strip().upper() == "GARUVA":
            nf.municipio_fato_gerador_ibs = cmun

    if requires_dhcont_xjust(tp_emis):
        if hasattr(nf, "data_contingencia_xml"):
            nf.data_contingencia_xml = _get(sap, "dh_contingencia") or nf.data_emissao
        if hasattr(nf, "justificativa_contingencia"):
            nf.justificativa_contingencia = (
                _get(sap, "x_justificativa")
                or "SEFAZ indisponivel - emissao em contingencia"
            )

    nf.valor_produtos = _parse_decimal(sap, "valor_produtos")
    nf.valor_frete = _parse_decimal(sap, "valor_frete", default=Decimal("0"))
    nf.valor_seguro = _parse_decimal(sap, "valor_seguro", default=Decimal("0"))
    nf.valor_desconto = _parse_decimal(sap, "valor_desconto", default=Decimal("0"))
    nf.valor_total_ii = _parse_decimal(sap, "valor_total_ii", default=Decimal("0"))
    nf.valor_ipi = _parse_decimal(sap, "valor_ipi", default=Decimal("0"))
    nf.valor_pis = _parse_decimal(sap, "valor_pis", default=Decimal("0"))
    nf.valor_cofins = _parse_decimal(sap, "valor_cofins", default=Decimal("0"))
    nf.valor_despesas_acessorias = _parse_decimal(sap, "valor_outras_despesas", default=Decimal("0"))
    nf.valor_total = _parse_decimal(sap, "valor_total")
    nf.valor_total_tributos = _parse_decimal(sap, "valor_total_tributos", default=Decimal("0"))
    nf.icms_base_calculo = _parse_decimal(sap, "icms_base_calculo", default=Decimal("0"))
    nf.icms_valor_total = _parse_decimal(sap, "icms_valor_total", default=Decimal("0"))

    if _get(sap, "modalidade_frete") is not None and str(_get(sap, "modalidade_frete")).strip() != "":
        nf.modalidade_frete = _parse_int(sap, "modalidade_frete")

    info_contrib = (
        _get(sap, "informacoes_adicionais_contribuinte")
        or _get(sap, "informacoes_adicionais_contrib")
        or ""
    )
    if homologacao:
        text = f"{HOMOLOGACAO_DISCLAIMER}; {info_contrib}" if info_contrib else HOMOLOGACAO_DISCLAIMER
        nf.informacoes_complementares_interesse_contribuinte = text
    elif info_contrib:
        nf.informacoes_complementares_interesse_contribuinte = info_contrib

    items = _get(sap, "items") or []
    for item in items:
        _add_produto(nf, item, sap)

    if not items:
        raise SapNfeMapperError("items[] is required and cannot be empty")

    # Reforma totals (IBSCBSTot) are rebuilt from the items by
    # sefaz/ibscbs_nfe.py — SAP header totals are not trusted for the XML.

    nf.adicionar_responsavel_tecnico(**_RESPONSAVEL_TECNICO)
    _map_fatura(nf, sap)
    _map_autorizados(nf, sap)
    _map_tributos_aproximados(nf, sap)

    # Upstream PyNFe (main) serializes valor_tributos_aprox but the entity
    # field is missing on some commits — set a safe default so exportar works.
    for prod in getattr(nf, "produtos_e_servicos", []) or []:
        if not hasattr(prod, "valor_tributos_aprox"):
            prod.valor_tributos_aprox = Decimal("0")

    return nf


def _map_fatura(nf: NotaFiscal, sap: dict) -> None:
    numero = _get(sap, "numero_fatura")
    if not numero:
        return
    nf.fatura_numero = str(numero)[:60]
    nf.fatura_valor_original = _parse_decimal(sap, "valor_original_fatura", default=Decimal("0"))
    nf.fatura_valor_desconto = _parse_decimal(sap, "valor_desconto_fatura", default=Decimal("0"))
    nf.fatura_valor_liquido = _parse_decimal(
        sap, "valor_liquido_fatura", default=nf.fatura_valor_original
    )


def _map_autorizados(nf: NotaFiscal, sap: dict) -> None:
    for person in _get(sap, "pessoas_autorizadas") or []:
        if not isinstance(person, dict):
            continue
        raw = _get(person, "cnpj") or _get(person, "cpf") or ""
        if not str(raw).strip():
            continue
        try:
            if any(ch.isalpha() for ch in str(raw)) or len(_digits(raw)) != 11:
                doc = normalize_cnpj(raw, field="pessoas_autorizadas.cnpj")
            else:
                doc = normalize_cpf(raw, field="pessoas_autorizadas.cpf")
        except CnpjDocError as exc:
            raise SapNfeMapperError(str(exc)) from exc
        nf.adicionar_autorizados_baixar_xml(CPFCNPJ=doc)


def _map_tributos_aproximados(nf: NotaFiscal, sap: dict) -> None:
    """vTotTrib is optional, but the header must equal the sum of the items."""
    products = list(getattr(nf, "produtos_e_servicos", []) or [])
    item_sum = sum((getattr(prod, "valor_tributos_aprox", None) or Decimal("0")) for prod in products)
    header = _money2(_opt_decimal(sap, "valor_total_tributos"))
    if item_sum:
        nf.totais_tributos_aproximado = item_sum
        return
    if header is not None and len(products) == 1:
        products[0].valor_tributos_aprox = header
        nf.totais_tributos_aproximado = header


def _build_emitente(sap: dict) -> Emitente:
    emit = Emitente()
    emit.razao_social = _parse_str(sap, "nome_emitente")
    emit.nome_fantasia = _get(sap, "nome_fantasia_emitente") or ""
    emit.cnpj = _cnpj14(_parse_str(sap, "cnpj_emitente"), field="cnpj_emitente")
    emit.codigo_de_regime_tributario = _parse_str(sap, "regime_tributario_emitente")
    emit.inscricao_estadual = _parse_str(sap, "inscricao_estadual_emitente")
    emit.endereco_logradouro = _parse_str(sap, "logradouro_emitente")
    emit.endereco_numero = _parse_str(sap, "numero_emitente")
    emit.endereco_bairro = _parse_str(sap, "bairro_emitente")
    emit.endereco_municipio = _parse_str(sap, "municipio_emitente")
    emit.endereco_uf = _parse_str(sap, "uf_emitente").upper()
    emit.endereco_cep = _digits(_get(sap, "cep_emitente"))
    emit.endereco_pais = _get(sap, "codigo_pais_emitente") or "1058"
    if _get(sap, "telefone_emitente"):
        emit.endereco_telefone = _digits(_get(sap, "telefone_emitente"))
    if _get(sap, "complemento_emitente"):
        emit.endereco_complemento = str(_get(sap, "complemento_emitente"))[:60]
    cmun = _resolve_emitente_ibge(sap)
    if cmun:
        emit.endereco_cod_municipio = cmun
    return emit


# Plant city → IBGE (authoritative). Wins over a wrong/omitted code in SAP JSON
# so resends still fix cStat 270 after a bad normalize was persisted.
_KNOWN_EMITENTE_IBGE = {
    ("GARUVA", "SC"): "4205803",  # not 4205906 (Gaspar)
}


def _resolve_emitente_ibge(sap: dict) -> str | None:
    city = str(_get(sap, "municipio_emitente") or "").strip().upper()
    uf = str(_get(sap, "uf_emitente") or "").strip().upper()
    if (city, uf) in _KNOWN_EMITENTE_IBGE:
        return _KNOWN_EMITENTE_IBGE[(city, uf)]
    for key in ("codigo_municipio_fato_gerador", "codigo_municipio_emitente"):
        val = _get(sap, key)
        if val is not None and str(val).strip():
            digits = "".join(ch for ch in str(val) if ch.isdigit())
            if len(digits) == 7:
                return digits
    # SAP often omits the IBGE code. PyNFe still resolves emit/cMun from the
    # city name; ide/cMunFG is a separate field and SEFAZ reports the next
    # tag (tpImp) when it is missing.
    if city and uf:
        try:
            from pynfe.utils import obter_codigo_por_municipio

            return str(obter_codigo_por_municipio(city, uf))
        except (ValueError, OSError):
            return None
    return None


def _build_destinatario(sap: dict) -> Cliente:
    cnpj = str(_get(sap, "cnpj_destinatario") or "").strip()
    cpf = str(_get(sap, "cpf_destinatario") or "").strip()
    id_estr = str(_get(sap, "id_estrangeiro_destinatario") or "").strip()
    uf = str(_get(sap, "uf_destinatario") or "").upper()
    pais = str(_get(sap, "codigo_pais_destinatario") or "1058")
    is_export = uf == "EX" or pais != "1058"

    cliente = Cliente()
    cliente.razao_social = _parse_str(sap, "nome_destinatario")[:60]
    cliente.endereco_logradouro = _parse_str(sap, "logradouro_destinatario")
    cliente.endereco_numero = _parse_str(sap, "numero_destinatario")
    cliente.endereco_bairro = _parse_str(sap, "bairro_destinatario")
    cliente.endereco_municipio = _parse_str(sap, "municipio_destinatario")
    cliente.endereco_uf = uf or _parse_str(sap, "uf_destinatario").upper()
    cliente.endereco_cep = _digits(_get(sap, "cep_destinatario"))
    cliente.endereco_pais = pais

    cnpj_d = _digits(cnpj)
    cpf_d = _digits(cpf)
    cnpj_has_alpha = any(ch.isalpha() for ch in cnpj)

    if is_export and not cnpj_has_alpha and len(cnpj_d) != 14 and len(cpf_d) != 11:
        # Also allow truncated numeric that pads to 14.
        try:
            cnpj_try = normalize_cnpj(cnpj, field="cnpj_destinatario", required=False) if cnpj else ""
        except CnpjDocError:
            cnpj_try = ""
        if len(cnpj_try) != 14 and len(cpf_d) != 11:
            cliente.tipo_documento = "CNPJ"
            cliente.numero_documento = ""
        elif len(cnpj_try) == 14:
            cliente.tipo_documento = "CNPJ"
            cliente.numero_documento = cnpj_try
        else:
            cliente.tipo_documento = "CPF"
            cliente.numero_documento = normalize_cpf(cpf, field="cpf_destinatario")
    elif cnpj_has_alpha or cnpj_d:
        cliente.tipo_documento = "CNPJ"
        cliente.numero_documento = _cnpj14(cnpj or _get(sap, "cnpj_destinatario"), field="cnpj_destinatario")
    elif len(cpf_d) == 11 or cpf_d:
        cliente.tipo_documento = "CPF"
        cliente.numero_documento = _cpf11(cpf, field="cpf_destinatario")
    elif not is_export:
        raise SapNfeMapperError(
            "cnpj_destinatario ou cpf_destinatario é obrigatório (CNPJ 14 caracteres ou CPF 11)."
        )
    else:
        cliente.tipo_documento = "CNPJ"
        cliente.numero_documento = ""

    ie = _get(sap, "inscricao_estadual_destinatario") or _get(sap, "inscricao_estadual_dest")
    if ie:
        cliente.inscricao_estadual = ie
    if _get(sap, "codigo_municipio_destinatario"):
        cliente.endereco_cod_municipio = _get(sap, "codigo_municipio_destinatario")
    if _get(sap, "email_destinatario"):
        cliente.email = _get(sap, "email_destinatario")
    if _get(sap, "complemento_destinatario"):
        cliente.endereco_complemento = str(_get(sap, "complemento_destinatario"))[:60]
    if _get(sap, "telefone_destinatario"):
        cliente.endereco_telefone = _digits(_get(sap, "telefone_destinatario"))
    if id_estr and id_estr not in ("0", "00") and hasattr(cliente, "id_estrangeiro"):
        cliente.id_estrangeiro = id_estr
    if _get(sap, "inscricao_suframa_destinatario"):
        cliente.inscricao_suframa = _get(sap, "inscricao_suframa_destinatario")
    ind_ie = _get(sap, "indicador_inscricao_estadual_destinatario") or _get(sap, "indicador_inscricao_est_dest")
    if ind_ie and hasattr(cliente, "indicador_ie"):
        cliente.indicador_ie = ind_ie
    return cliente


def _add_produto(nf: NotaFiscal, item: dict, sap: dict) -> None:
    # ABAP truncated / alternate tax field names
    icms_cst = _get(item, "icms_cst") or _get(item, "icms_situacao_tributaria") or "00"
    icms_mod = _get(item, "icms_modalidade") or _get(item, "icms_modalidade_base_calculo") or "0"
    icms_base_key = "icms_base" if _get(item, "icms_base") is not None else "icms_base_calculo"
    kwargs: dict[str, Any] = {
        "codigo": _get(item, "codigo_produto") or "",
        "descricao": _get(item, "descricao") or "",
        "ncm": _get(item, "codigo_ncm") or "",
        "cfop": _get(item, "cfop") or "",
        "unidade_comercial": _get(item, "unidade_comercial") or "UN",
        "quantidade_comercial": _parse_decimal(item, "quantidade_comercial"),
        "valor_unitario_comercial": _parse_decimal(item, "valor_unitario_comercial"),
        "valor_total_bruto": _parse_decimal(item, "valor_bruto"),
        "unidade_tributavel": _get(item, "unidade_tributavel") or _get(item, "unidade_comercial") or "UN",
        "quantidade_tributavel": _parse_decimal(
            item, "quantidade_tributavel", default=_parse_decimal(item, "quantidade_comercial")
        ),
        "valor_unitario_tributavel": _parse_decimal(
            item, "valor_unitario_tributavel", default=_parse_decimal(item, "valor_unitario_comercial")
        ),
        "ean": _get(item, "codigo_barras_comercial") or "SEM GTIN",
        "ean_tributavel": _get(item, "codigo_barras_tributavel") or _get(item, "codigo_barras_comercial") or "SEM GTIN",
        "ind_total": 1,
        "icms_origem": _get(item, "icms_origem") or "0",
        "icms_modalidade": icms_cst or icms_mod or "00",
        "icms_csosn": _get(item, "icms_csosn") or "",
    }

    # ICMS values
    if _get(item, icms_base_key) is not None:
        kwargs["icms_valor_base_calculo"] = _parse_decimal(item, icms_base_key, default=Decimal("0"))
    if _get(item, "icms_aliquota") is not None:
        kwargs["icms_aliquota"] = _parse_decimal(item, "icms_aliquota", default=Decimal("0"))
    if _get(item, "icms_valor") is not None:
        kwargs["icms_valor"] = _parse_decimal(item, "icms_valor", default=Decimal("0"))
    if icms_mod:
        kwargs["icms_modalidade_determinacao_bc"] = str(icms_mod)

    # ICMS-ST (CST 10/30/70/90). PyNFe writes modBCST/vBCST/vICMSST from these
    # fields and adds icms_st_valor into vNF. Omitting them leaves CST 10 with
    # every ST amount at zero and dumps the payment gap into vTroco.
    mod_st = _get(item, "icms_st_modalidade") or _get(item, "icms_mod_base_calculo_st")
    if mod_st is not None and str(mod_st).strip() != "":
        digits = "".join(ch for ch in str(mod_st) if ch.isdigit())
        kwargs["icms_st_modalidade_determinacao_bc"] = int(digits[-1]) if digits else 0
    for src, dst in (
        ("icms_st_mva_aliquota", "icms_st_percentual_adicional"),
        ("icms_margem_valor_adic_st", "icms_st_percentual_adicional"),
        ("icms_st_reducao_percent", "icms_st_percentual_reducao_bc"),
        ("icms_reducao_base_calculo_st", "icms_st_percentual_reducao_bc"),
        ("icms_st_base", "icms_st_valor_base_calculo"),
        ("icms_base_calculo_st", "icms_st_valor_base_calculo"),
        ("icms_st_aliquota", "icms_st_aliquota"),
        ("icms_aliquota_st", "icms_st_aliquota"),
        ("icms_st_valor", "icms_st_valor"),
        ("icms_valor_st", "icms_st_valor"),
        ("icms_st_fcp_aliquota", "fcp_st_aliquota"),
        ("fcp_percentual_st", "fcp_st_aliquota"),
        ("icms_st_fcp_valor", "fcp_st_valor"),
        ("fcp_valor_st", "fcp_st_valor"),
    ):
        if _get(item, src) is not None and dst not in kwargs:
            kwargs[dst] = _parse_decimal(item, src, default=Decimal("0"))
    if kwargs.get("fcp_st_valor") and "fcp_st_base_calculo" not in kwargs:
        base_st = kwargs.get("icms_st_valor_base_calculo")
        if base_st is not None:
            kwargs["fcp_st_base_calculo"] = base_st

    ind_total = _get(item, "inclui_no_total") or _get(item, "ind_total") or "1"
    try:
        kwargs["ind_total"] = int(ind_total)
    except (TypeError, ValueError):
        kwargs["ind_total"] = 1

    if _get(item, "codigo_ex_tipi"):
        kwargs["extipi"] = str(_get(item, "codigo_ex_tipi"))
    if _get(item, "cest"):
        kwargs["cest"] = str(_get(item, "cest"))
    if _get(item, "numero_fci"):
        kwargs["nfci"] = str(_get(item, "numero_fci"))

    for src, dst in (
        ("valor_frete", "frete"),
        ("valor_seguro", "seguro"),
        ("valor_desconto", "desconto"),
        ("valor_outras_despesas", "outras_despesas_acessorias"),
    ):
        if _get(item, src) is not None:
            kwargs[dst] = _parse_decimal(item, src, default=Decimal("0"))

    # ICMS51 deferral
    if _get(item, "icms_valor_operacao") is not None:
        kwargs["icms_valor_operacao"] = _parse_decimal(item, "icms_valor_operacao")
    if _get(item, "icms_percentual_diferimento") is not None:
        kwargs["icms_percentual_diferimento"] = _parse_decimal(item, "icms_percentual_diferimento")
    if _get(item, "icms_valor_diferido") is not None:
        kwargs["icms_valor_diferido"] = _parse_decimal(item, "icms_valor_diferido")

    if _get(item, "cbenef") or _get(item, "codigo_beneficio_fiscal"):
        kwargs["cbenef"] = _get(item, "cbenef") or _get(item, "codigo_beneficio_fiscal")

    # PIS / COFINS / IPI (ABAP may send *_situacao_tributaria / *_aliquota_porcentual).
    # Require CST on each item and set both PyNFe field aliases used by the
    # entity vs serialização layers.
    item_label = _item_label(item)
    pis_cst = _normalize_pis_cofins_cst(
        _get(item, "pis_cst") or _get(item, "pis_situacao_tributaria") or _get(item, "pis_modalidade"),
        imposto="PIS",
        item_label=item_label,
        fields="pis_cst ou pis_situacao_tributaria",
    )
    kwargs["pis_modalidade"] = pis_cst
    kwargs["pis_situacao_tributaria"] = pis_cst
    kwargs["pis_valor_base_calculo"] = _parse_decimal(
        item, "pis_base", default=_parse_decimal(item, "pis_base_calculo", default=Decimal("0"))
    )
    kwargs["pis_aliquota_percentual"] = _parse_decimal(
        item, "pis_aliquota", default=_parse_decimal(item, "pis_aliquota_porcentual", default=Decimal("0"))
    )
    kwargs["pis_valor"] = _parse_decimal(item, "pis_valor", default=Decimal("0"))

    cofins_cst = _normalize_pis_cofins_cst(
        _get(item, "cofins_cst")
        or _get(item, "cofins_situacao_tributaria")
        or _get(item, "cofins_modalidade"),
        imposto="COFINS",
        item_label=item_label,
        fields="cofins_cst ou cofins_situacao_tributaria",
    )
    kwargs["cofins_modalidade"] = cofins_cst
    kwargs["cofins_situacao_tributaria"] = cofins_cst
    kwargs["cofins_valor_base_calculo"] = _parse_decimal(
        item, "cofins_base", default=_parse_decimal(item, "cofins_base_calculo", default=Decimal("0"))
    )
    kwargs["cofins_aliquota_percentual"] = _parse_decimal(
        item, "cofins_aliquota", default=_parse_decimal(item, "cofins_aliquota_porcentual", default=Decimal("0"))
    )
    kwargs["cofins_valor"] = _parse_decimal(item, "cofins_valor", default=Decimal("0"))
    ipi_cst = _get(item, "ipi_cst") or _get(item, "ipi_situacao_tributaria")
    if ipi_cst:
        # PyNFe treats ipi_codigo_enquadramento as the CST (IPINT vs IPITrib)
        # and ipi_classe_enquadramento as cEnq.
        kwargs["ipi_codigo_enquadramento"] = str(ipi_cst).zfill(2)[-2:]
        enq = str(
            _get(item, "ipi_enquadramento") or _get(item, "ipi_codigo_enquadramento_legal") or "999"
        )
        enq_digits = "".join(ch for ch in enq if ch.isdigit()) or "999"
        kwargs["ipi_classe_enquadramento"] = enq_digits.zfill(3)[-3:]
        kwargs["ipi_valor_base_calculo"] = _parse_decimal(
            item, "ipi_base", default=_parse_decimal(item, "ipi_base_calculo", default=Decimal("0"))
        )
        kwargs["ipi_aliquota"] = _parse_decimal(item, "ipi_aliquota", default=Decimal("0"))
        kwargs["ipi_valor_ipi"] = _parse_decimal(item, "ipi_valor", default=Decimal("0"))
    if _get(item, "informacoes_adicionais_item"):
        kwargs["informacoes_adicionais"] = str(_get(item, "informacoes_adicionais_item"))[:500]
    trib_item = _money2(_opt_decimal(item, "valor_tributos") or _opt_decimal(item, "valor_total_tributos"))
    if trib_item is not None:
        kwargs["valor_tributos_aprox"] = trib_item

    # IBS/CBS (reforma): NOT passed to PyNFe. Its serializer picks the group
    # from a fixed CST list (wrong for 011/220/221/222/400/515/550/620/800/
    # 810/811/830) and has no gIBSCBSMono/gRed/gDif/... — the whole
    # det/imposto/IBSCBS and total/IBSCBSTot are built by
    # sefaz/ibscbs_nfe.py from the SAP item, driven by data/cst_ibscbs.json.

    # gCred / crédito presumido
    presumidos = _get(item, "infos_credito_presumido") or []
    if presumidos:
        cred = presumidos[0]
        if _get(cred, "codigo_credito_presumido"):
            kwargs["cbenef"] = kwargs.get("cbenef") or _get(cred, "codigo_credito_presumido")
        for src, dst in (
            ("codigo_credito_presumido", "credito_presumido_codigo"),
            ("percentual_presumido", "credito_presumido_percentual"),
            ("valor_presumido", "credito_presumido_valor"),
        ):
            if cred.get(src) is not None:
                kwargs[dst] = cred[src] if src.startswith("codigo") else _parse_decimal(cred, src)

    # ZFM / SUFRAMA hard rule from legacy
    cfop = str(item.get("cfop") or "")
    if (
        cfop == "6109"
        and str(item.get("icms_cst") or "") == "40"
        and str(item.get("icms_motivo_desoneracao") or "") == "7"
        and not sap.get("inscricao_suframa_destinatario")
    ):
        raise SapNfeMapperError("CFOP 6109 + CST 40 + motDesICMS 7 requires inscricao_suframa_destinatario (ISUF)")

    # II for import CFOP
    if cfop.startswith("3"):
        kwargs["imposto_importacao_valor_base_calculo"] = _parse_decimal(
            item, "ii_base", default=Decimal("0.01")
        )
        kwargs["imposto_importacao_valor_despesas_aduaneiras"] = _parse_decimal(
            item, "ii_despesas_aduaneiras", default=Decimal("0")
        )
        kwargs["imposto_importacao_valor"] = _parse_decimal(item, "ii_valor", default=Decimal("0"))
        kwargs["imposto_importacao_valor_iof"] = _parse_decimal(item, "ii_iof", default=Decimal("0"))

    # Filter kwargs to what adicionar_produto_servico accepts via ** or known attrs
    try:
        nf.adicionar_produto_servico(**kwargs)
    except TypeError:
        # Fall back: only pass known product ctor fields
        safe = {k: v for k, v in kwargs.items() if k in (
            "codigo", "descricao", "ncm", "cfop", "unidade_comercial", "quantidade_comercial",
            "valor_unitario_comercial", "valor_total_bruto", "unidade_tributavel",
            "quantidade_tributavel", "valor_unitario_tributavel", "ean", "ean_tributavel",
            "ind_total", "icms_origem", "icms_modalidade", "icms_csosn",
            "pis_modalidade", "pis_situacao_tributaria",
            "cofins_modalidade", "cofins_situacao_tributaria",
            "pis_valor", "cofins_valor",
        )}
        nf.adicionar_produto_servico(**safe)
        # Set remaining attrs on the last product. Use object.__setattr__ so
        # serialization-only aliases (pis_modalidade) stick even when the
        # class declares a different name and hasattr() is False.
        if nf.produtos_e_servicos:
            prod = nf.produtos_e_servicos[-1]
            for k, v in kwargs.items():
                try:
                    object.__setattr__(prod, k, v)
                except Exception:
                    pass

    # Guarantee PyNFe serialização aliases exist on the instance.
    if nf.produtos_e_servicos:
        prod = nf.produtos_e_servicos[-1]
        object.__setattr__(prod, "pis_modalidade", kwargs["pis_modalidade"])
        object.__setattr__(prod, "pis_situacao_tributaria", kwargs["pis_situacao_tributaria"])
        object.__setattr__(prod, "cofins_modalidade", kwargs["cofins_modalidade"])
        object.__setattr__(prod, "cofins_situacao_tributaria", kwargs["cofins_situacao_tributaria"])
        _apply_combustivel(prod, item, sap)


# SEFAZ cStat 660: these CFOPs require prod/comb (cProdANP, descANP, UFCons).
_CFOP_COMBUSTIVEL = frozenset({
    "1651", "1652", "1653", "1658", "1659", "1660", "1661", "1662", "1663", "1664",
    "2651", "2652", "2653", "2658", "2659", "2660", "2661", "2662", "2663", "2664",
    "3651", "3652", "3653",
    "5651", "5652", "5653", "5654", "5655", "5656", "5657", "5658", "5659",
    "5660", "5661", "5662", "5663", "5664", "5665", "5666", "5667",
    "6651", "6652", "6653", "6654", "6655", "6656", "6657", "6658", "6659",
    "6660", "6661", "6662", "6663", "6664", "6665", "6666", "6667",
    "7651", "7654", "7667",
})


def _apply_combustivel(prod: Any, item: dict, sap: dict) -> None:
    """Map YNEX flat combustivel_* fields onto PyNFe so <comb> is serialized.

    SAP sends zeros and a zero-filled CODIF as placeholders. Those must stay
    out of the XML: optional comb children are omitted when absent, and a
    CODIF of zeros is not an ANP registration.
    """
    label = _item_label(item)
    cfop = "".join(ch for ch in str(_get(item, "cfop") or "") if ch.isdigit())
    anp = "".join(ch for ch in str(_get(item, "combustivel_codigo_anp") or "") if ch.isdigit())
    if not anp:
        if cfop in _CFOP_COMBUSTIVEL:
            raise SapNfeMapperError(
                f"{label}: CFOP {cfop} exige o grupo de combustível "
                "(combustivel_codigo_anp, combustivel_descricao_anp, combustivel_sigla_uf)."
            )
        return
    anp = anp.zfill(9)[-9:]
    desc = str(_get(item, "combustivel_descricao_anp") or "").strip()
    if len(desc) < 2:
        raise SapNfeMapperError(f"{label}: combustivel_descricao_anp é obrigatório com código ANP.")
    uf = str(
        _get(item, "combustivel_sigla_uf") or _get(sap, "uf_destinatario") or ""
    ).strip().upper()
    if len(uf) != 2:
        raise SapNfeMapperError(f"{label}: combustivel_sigla_uf é obrigatório com código ANP.")

    object.__setattr__(prod, "cProdANP", anp)
    object.__setattr__(prod, "descANP", desc[:95])
    object.__setattr__(prod, "UFCons", uf)

    for src, dst in (
        ("combustivel_percentual_glp", "pGLP"),
        ("combustivel_percentual_gas_na", "pGNn"),
        ("combustivel_percentual_gas_im", "pGNi"),
        ("combustivel_valor_partida", "vPart"),
        ("combustivel_percentual_biodies", "comb_p_bio"),
    ):
        val = _opt_decimal(item, src)
        if val is not None and val != 0:
            object.__setattr__(prod, dst, val)

    codif = "".join(ch for ch in str(_get(item, "combustivel_registro_codif") or "") if ch.isdigit())
    if codif and int(codif) != 0:
        object.__setattr__(prod, "comb_codif", codif[:21])

    qtemp = _opt_decimal(item, "combustivel_quantidade_temp")
    if qtemp is not None and qtemp != 0:
        object.__setattr__(prod, "comb_q_temp", f"{qtemp:.4f}")

    bico = "".join(ch for ch in str(_get(item, "combustivel_numero_bico") or "") if ch.isdigit())
    if bico and int(bico) != 0:
        object.__setattr__(prod, "comb_n_bico", int(bico))
        bomba = "".join(ch for ch in str(_get(item, "combustivel_numero_bomba") or "") if ch.isdigit())
        tanque = "".join(ch for ch in str(_get(item, "combustivel_numero_tanque") or "") if ch.isdigit())
        if bomba and int(bomba) != 0:
            object.__setattr__(prod, "comb_n_bomba", int(bomba))
        object.__setattr__(prod, "comb_n_tanque", int(tanque or "0"))
        object.__setattr__(
            prod, "comb_v_enc_ini", _parse_decimal(item, "combustivel_valor_encerrante_i", default=Decimal("0"))
        )
        object.__setattr__(
            prod, "comb_v_enc_fin", _parse_decimal(item, "combustivel_valor_encerrante_f", default=Decimal("0"))
        )


def _item_label(item: dict) -> str:
    nitem = _get(item, "numero_item") or _get(item, "nitem")
    if nitem is not None and str(nitem).strip() != "":
        return f"Item {nitem}"
    codigo = _get(item, "codigo_produto")
    if codigo:
        return f"Item {codigo}"
    return "Item"


def _normalize_pis_cofins_cst(
    value: Any, *, imposto: str, item_label: str, fields: str
) -> str:
    """Return a 2-digit PIS/COFINS CST or raise a user-facing mapper error."""
    raw = str(value or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        raise SapNfeMapperError(
            f"{item_label}: falta CST de {imposto} no JSON ({fields})."
        )
    return digits.zfill(2)[-2:]


def _accepts(cls: type, name: str) -> bool:
    return hasattr(cls, name) or name in getattr(cls, "__annotations__", {})


def _set_if_attr(obj: Any, name: str, value: Any) -> None:
    if value is not None and hasattr(obj, name):
        setattr(obj, name, value)


def _get(d: dict, key: str, default: Any = None) -> Any:
    """Case-insensitive dict get for SAP UPPERCASE / mixed payloads."""
    if key in d:
        return d[key]
    key_l = key.lower()
    for k, v in d.items():
        if isinstance(k, str) and k.lower() == key_l:
            return v
    return default


def _digits(val: Any) -> str:
    return "".join(ch for ch in str(val or "") if ch.isdigit())


def _cnpj14(value: Any, *, field: str) -> str:
    """CNPJ 14 chars (NT 2026.004 alfanumérico ou numérico clássico)."""
    try:
        return normalize_cnpj(value, field=field)
    except CnpjDocError as exc:
        raise SapNfeMapperError(str(exc)) from exc


def _cpf11(value: Any, *, field: str) -> str:
    try:
        return normalize_cpf(value, field=field)
    except CnpjDocError as exc:
        raise SapNfeMapperError(str(exc)) from exc


def format_nfe_serie(value: str) -> str:
    """NF-e ide/serie (TSerie): ``0`` or ``[1-9][0-9]{0,2}``. Rejects ``000``."""
    digits = "".join(ch for ch in str(value).strip() if ch.isdigit())
    if digits == "":
        raise SapNfeMapperError("serie is required")
    number = int(digits)
    if number > 999:
        raise SapNfeMapperError("serie must be between 0 and 999")
    return str(number)


def _parse_nfe_number(d: dict, key: str) -> int:
    """Parse ide/nNF. Leading zeros from SAP (``000034155``) are fine; 0 is not."""
    val = _get(d, key)
    if val is None or str(val).strip() == "":
        raise SapNfeMapperError(f"Missing required field: {key}")
    digits = "".join(ch for ch in str(val).strip() if ch.isdigit())
    if digits == "":
        raise SapNfeMapperError(f"Invalid {key}: {val!r}")
    number = int(digits)
    if number < 1 or number > 999_999_999:
        raise SapNfeMapperError(f"{key} must be between 1 and 999999999, got {number}")
    return number


def _parse_str(d: dict, key: str) -> str:
    val = _get(d, key)
    if val is None:
        raise SapNfeMapperError(f"Missing required field: {key}")
    return str(val)


def _parse_int(d: dict, key: str, default: int | None = None) -> int:
    val = _get(d, key)
    text = "" if val is None else str(val).strip()
    if text == "":
        if default is not None:
            return default
        raise SapNfeMapperError(f"Missing required field: {key}")
    try:
        return int(text)
    except ValueError as exc:
        raise SapNfeMapperError(f"Invalid integer for {key}: {val!r}") from exc


def _parse_decimal(d: dict, key: str, default: Decimal | None = None) -> Decimal:
    val = _get(d, key)
    if val is None:
        if default is not None:
            return default
        raise SapNfeMapperError(f"Missing required field: {key}")
    return Decimal(str(val).strip())


def _opt_decimal(d: dict, key: str) -> Decimal | None:
    val = _get(d, key)
    if val is None:
        return None
    text = str(val).strip()
    if text == "":
        return None
    return Decimal(text)


_CENTS = Decimal("0.01")


def _money2(value: Decimal | None) -> Decimal | None:
    """PyNFe writes item vTotTrib via str(); TDec_1302 needs exactly 2 decimals."""
    return None if value is None else value.quantize(_CENTS, rounding=ROUND_HALF_UP)


def _parse_datetime(d: dict, key: str, required: bool = True) -> datetime | None:
    val = _get(d, key)
    if val is None:
        if required:
            raise SapNfeMapperError(f"Missing required field: {key}")
        return None
    if isinstance(val, str):
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    raise SapNfeMapperError(f"Field {key} must be ISO8601 string")


def _to_brasilia(dt: datetime) -> datetime:
    """Naive values are taken as Brasília time; aware values are converted."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=_BRASILIA_TZ)
    return dt.astimezone(_BRASILIA_TZ)


def _clamp_future_emission(dh_emi: datetime, now: datetime | None = None) -> datetime:
    """SEFAZ rejects dhEmi after its receipt time (cStat 703).

    SAP may send a placeholder time (e.g. document date + 12:00:00); in that
    case emit with the current time, keeping a margin for clock skew.
    """
    limit = (now or datetime.now(_BRASILIA_TZ)).astimezone(_BRASILIA_TZ) - _EMISSION_CLOCK_MARGIN
    limit = limit.replace(microsecond=0)
    return limit if dh_emi > limit else dh_emi


# Re-export for callers / tests
__all__ = [
    "SapNfeMapperError",
    "build_unsigned_xml",
    "resolve_tp_emis",
    "is_contingencia",
    "CONTINGENCIA_TP_EMIS",
]
