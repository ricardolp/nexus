"""Maps flat SAP Portuguese JSON → PyNFe NF-e entities + XML patches.

Contract: YNEX_IF_MSG_NFE (flat snake_case) — see backend/internal/fiscal/sap_outbound.go.
NOT the legacy DRC VALUES.* shape.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
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
from nfe_gateway.sefaz.environment import HOMOLOGACAO_DISCLAIMER
from nfe_gateway.sefaz.xml_patches import apply_all_patches


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
    xml = apply_all_patches(xml, sap_json)
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
    nf.numero_nf = _parse_int(sap, "numero")
    nf.serie = _parse_str(sap, "serie")
    nf.natureza_operacao = _parse_str(sap, "natureza_operacao")
    nf.tipo_documento = _parse_int(sap, "tipo_documento")
    nf.data_emissao = _parse_datetime(sap, "data_emissao")
    nf.data_saida_entrada = _parse_datetime(sap, "data_entrada_saida", required=False) or nf.data_emissao

    # Strip tzinfo — PyNFe serialização expects naive Brasília datetime
    if nf.data_emissao and getattr(nf.data_emissao, "tzinfo", None):
        nf.data_emissao = nf.data_emissao.replace(tzinfo=None)
    if nf.data_saida_entrada and getattr(nf.data_saida_entrada, "tzinfo", None):
        nf.data_saida_entrada = nf.data_saida_entrada.replace(tzinfo=None)

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
    nf.formato_impressao_danfe = 1

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

    # Reforma totals (do NOT add to vNF)
    _set_if_attr(nf, "totais_vbc_ibscbs", _opt_decimal(sap, "ibs_base_calculo") or _opt_decimal(sap, "cbs_base_calculo"))
    _set_if_attr(nf, "totais_ibs_uf", _opt_decimal(sap, "ibs_uf_valor_total"))
    _set_if_attr(nf, "totais_ibs_mun", _opt_decimal(sap, "ibs_mun_valor_total"))
    _set_if_attr(nf, "totais_ibs", _opt_decimal(sap, "ibs_valor_total"))
    _set_if_attr(nf, "totais_cbs", _opt_decimal(sap, "cbs_valor_total"))

    if _get(sap, "modalidade_frete") is not None:
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

    # Upstream PyNFe (main) serializes valor_tributos_aprox but the entity
    # field is missing on some commits — set a safe default so exportar works.
    for prod in getattr(nf, "produtos_e_servicos", []) or []:
        if not hasattr(prod, "valor_tributos_aprox"):
            prod.valor_tributos_aprox = Decimal("0")

    return nf


def _build_emitente(sap: dict) -> Emitente:
    emit = Emitente()
    emit.razao_social = _parse_str(sap, "nome_emitente")
    emit.nome_fantasia = _get(sap, "nome_fantasia_emitente") or ""
    emit.cnpj = _digits(_parse_str(sap, "cnpj_emitente"))
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

    if is_export and len(_digits(cnpj)) != 14 and len(_digits(cpf)) != 11:
        cliente.tipo_documento = "CNPJ"
        cliente.numero_documento = ""
    elif len(_digits(cpf)) == 11 and len(_digits(cnpj)) != 14:
        cliente.tipo_documento = "CPF"
        cliente.numero_documento = _digits(cpf)
    else:
        cliente.tipo_documento = "CNPJ"
        cliente.numero_documento = _digits(cnpj) or _digits(_parse_str(sap, "cnpj_destinatario"))

    ie = _get(sap, "inscricao_estadual_destinatario") or _get(sap, "inscricao_estadual_dest")
    if ie:
        cliente.inscricao_estadual = ie
    if _get(sap, "codigo_municipio_destinatario"):
        cliente.endereco_cod_municipio = _get(sap, "codigo_municipio_destinatario")
    if _get(sap, "email_destinatario"):
        cliente.email = _get(sap, "email_destinatario")
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

    # PIS / COFINS / IPI (ABAP may send *_situacao_tributaria / *_aliquota_porcentual)
    pis_cst = _get(item, "pis_cst") or _get(item, "pis_situacao_tributaria")
    if pis_cst:
        kwargs["pis_modalidade"] = pis_cst
        kwargs["pis_valor_base_calculo"] = _parse_decimal(
            item, "pis_base", default=_parse_decimal(item, "pis_base_calculo", default=Decimal("0"))
        )
        kwargs["pis_aliquota_percentual"] = _parse_decimal(
            item, "pis_aliquota", default=_parse_decimal(item, "pis_aliquota_porcentual", default=Decimal("0"))
        )
        kwargs["pis_valor"] = _parse_decimal(item, "pis_valor", default=Decimal("0"))
    cofins_cst = _get(item, "cofins_cst") or _get(item, "cofins_situacao_tributaria")
    if cofins_cst:
        kwargs["cofins_modalidade"] = cofins_cst
        kwargs["cofins_valor_base_calculo"] = _parse_decimal(
            item, "cofins_base", default=_parse_decimal(item, "cofins_base_calculo", default=Decimal("0"))
        )
        kwargs["cofins_aliquota_percentual"] = _parse_decimal(
            item, "cofins_aliquota", default=_parse_decimal(item, "cofins_aliquota_porcentual", default=Decimal("0"))
        )
        kwargs["cofins_valor"] = _parse_decimal(item, "cofins_valor", default=Decimal("0"))
    ipi_cst = _get(item, "ipi_cst") or _get(item, "ipi_situacao_tributaria")
    if ipi_cst:
        kwargs["ipi_codigo_enquadramento"] = (
            _get(item, "ipi_enquadramento") or _get(item, "ipi_codigo_enquadramento_legal") or "999"
        )
        kwargs["ipi_valor_base_calculo"] = _parse_decimal(
            item, "ipi_base", default=_parse_decimal(item, "ipi_base_calculo", default=Decimal("0"))
        )
        kwargs["ipi_aliquota"] = _parse_decimal(item, "ipi_aliquota", default=Decimal("0"))
        kwargs["ipi_valor_ipi"] = _parse_decimal(item, "ipi_valor", default=Decimal("0"))

    # IBSCBS (reforma) — PyNFe main field names
    ibs_cst = (
        _get(item, "ibs_cst")
        or _get(item, "cbs_cst")
        or _get(item, "ibs_cbs_situacao_tributaria")
    )
    if ibs_cst:
        kwargs["ibscbs_cst"] = str(ibs_cst).zfill(3)
        cclass = (
            _get(item, "ibs_c_class_trib")
            or _get(item, "cbs_c_class_trib")
            or _get(item, "ibs_cbs_classificacao_tribut")
            or "000001"
        )
        kwargs["ibscbs_c_class_trib"] = str(cclass).zfill(6)
        vbc = (
            _opt_decimal(item, "ibs_base")
            or _opt_decimal(item, "cbs_base")
            or _opt_decimal(item, "ibs_cbs_base_calculo")
        )
        if vbc is not None:
            kwargs["ibscbs_vbc"] = vbc
        p_uf = _opt_decimal(item, "ibs_aliquota_uf") or _opt_decimal(item, "ibs_uf_aliquota") or _opt_decimal(item, "ibs_aliquota")
        if p_uf is not None:
            kwargs["ibscbs_p_ibs_uf"] = p_uf
        v_uf = _opt_decimal(item, "ibs_valor_uf") or _opt_decimal(item, "ibs_uf_valor") or _opt_decimal(item, "ibs_valor")
        if v_uf is not None:
            kwargs["ibscbs_v_ibs_uf"] = v_uf
        p_mun = _opt_decimal(item, "ibs_aliquota_mun") or _opt_decimal(item, "ibs_mun_aliquota")
        if p_mun is not None:
            kwargs["ibscbs_p_ibs_mun"] = p_mun
        v_mun = _opt_decimal(item, "ibs_valor_mun") or _opt_decimal(item, "ibs_mun_valor")
        if v_mun is not None:
            kwargs["ibscbs_v_ibs_mun"] = v_mun
        v_ibs = _opt_decimal(item, "ibs_valor") or _opt_decimal(item, "ibs_valor_total")
        if v_ibs is not None:
            kwargs["ibscbs_v_ibs"] = v_ibs
        p_cbs = _opt_decimal(item, "cbs_aliquota")
        if p_cbs is not None:
            kwargs["ibscbs_p_cbs"] = p_cbs
        v_cbs = _opt_decimal(item, "cbs_valor")
        if v_cbs is not None:
            kwargs["ibscbs_v_cbs"] = v_cbs
        # Monofásico CST 620
        if str(ibs_cst).zfill(3) == "620":
            for src, dst in (
                ("ibscbs_q_bc_mono", "ibscbs_q_bc_mono"),
                ("ibscbs_ad_rem_ibs", "ibscbs_ad_rem_ibs"),
                ("ibscbs_v_ibs_mono", "ibscbs_v_ibs_mono"),
                ("ibscbs_ad_rem_cbs", "ibscbs_ad_rem_cbs"),
                ("ibscbs_v_cbs_mono", "ibscbs_v_cbs_mono"),
            ):
                if _get(item, src) is not None:
                    kwargs[dst] = _parse_decimal(item, src)

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
            "pis_modalidade", "cofins_modalidade", "pis_valor", "cofins_valor",
        )}
        nf.adicionar_produto_servico(**safe)
        # Set remaining attrs on the last product
        if nf.produtos_e_servicos:
            prod = nf.produtos_e_servicos[-1]
            for k, v in kwargs.items():
                if hasattr(prod, k):
                    try:
                        setattr(prod, k, v)
                    except Exception:
                        pass


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


def _parse_str(d: dict, key: str) -> str:
    val = _get(d, key)
    if val is None:
        raise SapNfeMapperError(f"Missing required field: {key}")
    return str(val)


def _parse_int(d: dict, key: str, default: int | None = None) -> int:
    val = _get(d, key)
    if val is None:
        if default is not None:
            return default
        raise SapNfeMapperError(f"Missing required field: {key}")
    return int(val)


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


def _parse_datetime(d: dict, key: str, required: bool = True) -> datetime | None:
    val = _get(d, key)
    if val is None:
        if required:
            raise SapNfeMapperError(f"Missing required field: {key}")
        return None
    if isinstance(val, str):
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    raise SapNfeMapperError(f"Field {key} must be ISO8601 string")


# Re-export for callers / tests
__all__ = [
    "SapNfeMapperError",
    "build_unsigned_xml",
    "resolve_tp_emis",
    "is_contingencia",
    "CONTINGENCIA_TP_EMIS",
]
