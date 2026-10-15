"""Provedor IPM (Atende.Net): webservice próprio de NFS-e.

Municípios: Garuva/SC e dezenas de outros em SC/PR/RS. Cada município tem a
sua URL (``provider_config.base_url``); o resto do protocolo é igual.
Documentação: IPM NTE 35/2021 (emissão, cancelamento, retorno) e NTE
122/2025 (IBS/CBS).
"""

from __future__ import annotations

from typing import Any

from nfe_gateway.nfse.providers.base import (
    CancelRequest,
    EmitRequest,
    ProviderCapabilities,
    ProviderConfigError,
    mapper_rejection,
)
from nfe_gateway.nfse.providers.ipm import client as ipm_client
from nfe_gateway.nfse.providers.ipm.mapper import (
    IpmConfig,
    build_cancel,
    build_emission,
    serialize,
)
from nfe_gateway.nfse.providers.ipm.retorno import (
    AUTH_CODES,
    IpmRetorno,
    looks_like_test_validation,
    parse_retorno,
)
from nfe_gateway.nfse.providers.payload import PayloadError

HOMOLOGACAO_VALIDADA = "homologacao_validada"

_MISSING_CREDENTIALS = (
    "Empresa sem usuário/senha do webservice da prefeitura (IPM). Cadastre em "
    "Configurações → Empresas → NFS-e municipal e libere o acesso em "
    "Autorização → Utilização de NFSe → Emissão de NFS-e por WebService no portal da prefeitura."
)


def _code(ret: IpmRetorno, fallback: str) -> str:
    code = ret.first_code
    return f"ipm_{code:05d}" if code is not None else fallback


class IpmProvider:
    code = "ipm"

    def capabilities(self, config: dict[str, Any]) -> ProviderCapabilities:
        cfg = config or {}
        return ProviderCapabilities(
            needs_certificate=str(cfg.get("assinatura", "")).strip().lower() in {"1", "true", "s", "sim", "yes"},
            credentials="basic",
            identifies_by="number",
            homologation="test_flag",
        )

    # ------------------------------------------------------------------ emit
    def emit(self, req: EmitRequest) -> dict[str, Any]:
        try:
            cfg = IpmConfig.from_dict(req.config)
        except ProviderConfigError as exc:
            return {**mapper_rejection(str(exc), code="provider_config_error"), "outcome": "error"}
        if req.credentials is None or not req.credentials.username:
            return {**mapper_rejection(_MISSING_CREDENTIALS, code="provider_credentials_missing"), "outcome": "error"}

        try:
            emission = build_emission(
                req.payload, cfg, homologacao=req.homologacao, document_id=req.document_id
            )
            if cfg.assinatura:
                if not req.pfx:
                    raise PayloadError("O município exige XML assinado e a empresa não tem certificado A1 ativo.")
                from nfe_gateway.nfse.providers.ipm.sign import sign_ipm_xml

                xml = sign_ipm_xml(emission.root, pfx=req.pfx)
            else:
                xml = serialize(emission.root)
        except PayloadError as exc:
            return mapper_rejection(str(exc))

        try:
            resp = ipm_client.post_xml(
                url=cfg.base_url,
                xml=xml,
                credentials=req.credentials,
                timeout=cfg.timeout_seconds,
                file_field=cfg.file_field,
            )
        except ipm_client.IpmTransportError as exc:
            msg = f"{exc}. A nota volta para a fila automaticamente."
            return {
                "outcome": "retry",
                "error_code": "provider_timeout",
                "error_message": msg,
                "cstat": "provider_timeout",
                "x_motivo": msg,
                "signed_xml": xml,
                "response_xml": b"",
                "http_status": 504,
            }

        base = {"signed_xml": xml, "response_xml": resp.content, "http_status": resp.status_code}
        if resp.status_code >= 500:
            msg = f"IPM indisponível (HTTP {resp.status_code} {resp.reason}). A nota volta para a fila."
            return {**base, "outcome": "retry", "error_code": "provider_unavailable",
                    "error_message": msg, "cstat": str(resp.status_code), "x_motivo": msg}

        ret = parse_retorno(resp.content)
        if ret.parse_error:
            msg = ret.parse_error
            outcome = "error" if resp.status_code < 400 else "rejected"
            return {**base, "outcome": outcome, "error_code": f"http_{resp.status_code}",
                    "error_message": msg, "cstat": str(resp.status_code), "x_motivo": msg}

        if ret.numero_nfse and ret.situacao_codigo != "2":
            return {
                **base,
                "outcome": "authorized",
                "number": ret.numero_nfse,
                "verification_code": ret.cod_verificador,
                "access_key": ret.chave_acesso,
                "protocol": emission.identificador,
                "cstat": "100",
                "x_motivo": ret.message_text or "NFS-e emitida",
                "pdf_url": ret.link_nfse,
                "series": ret.serie_nfse,
                "_pdf_link": ret.link_nfse,
                **({"ibscbs": ret.ibscbs} if ret.ibscbs else {}),
            }

        if req.homologacao and looks_like_test_validation(ret):
            # A IPM não emite número em <nfse_teste>1. O XML passou na prefeitura:
            # no QAS isso libera o cliente (status authorized), sem inventar NFS-e.
            msg = (
                "Homologação IPM: XML validado pela prefeitura com <nfse_teste>1 — nenhuma "
                f"NFS-e foi emitida (a IPM não tem ambiente de homologação). Retorno: {ret.message_text}"
            )
            return {**base, "outcome": "authorized", "error_code": HOMOLOGACAO_VALIDADA,
                    "error_message": msg, "cstat": HOMOLOGACAO_VALIDADA, "x_motivo": msg,
                    "protocol": emission.identificador}

        code = _code(ret, f"http_{resp.status_code}")
        msg = ret.message_text or f"IPM recusou a nota (HTTP {resp.status_code})."
        if ret.first_code in AUTH_CODES:
            msg = f"{msg} — confira o usuário/senha do webservice e a liberação no portal da prefeitura."
        return {**base, "outcome": "rejected", "error_code": code, "error_message": msg,
                "cstat": code, "x_motivo": msg}

    def fetch_pdf(self, result: dict[str, Any], req: EmitRequest) -> bytes | None:
        link = str(result.get("_pdf_link") or "")
        if not link or req.credentials is None:
            return None
        try:
            cfg = IpmConfig.from_dict(req.config)
        except ProviderConfigError:
            return None
        return ipm_client.download_pdf(url=cfg.base_url, link=link, credentials=req.credentials)

    # ---------------------------------------------------------------- cancel
    def cancel(self, req: CancelRequest) -> dict[str, Any]:
        base: dict[str, Any] = {"event_kind": "cancel"}
        try:
            cfg = IpmConfig.from_dict(req.config)
        except ProviderConfigError as exc:
            return {**base, "outcome": "rejected", "error_message": str(exc), "x_motivo": str(exc)}
        if req.credentials is None or not req.credentials.username:
            return {**base, "outcome": "rejected", "error_message": _MISSING_CREDENTIALS,
                    "x_motivo": _MISSING_CREDENTIALS}
        if req.homologacao:
            msg = (
                "Homologação IPM: a prefeitura não tem ambiente de teste para cancelamento; "
                "nenhuma chamada foi feita."
            )
            return {**base, "outcome": "rejected", "cstat": HOMOLOGACAO_VALIDADA, "error_message": msg, "x_motivo": msg}
        try:
            root = build_cancel(
                cnpj=req.cnpj,
                municipality_ibge=req.municipality_code,
                nfse_number=req.nfse_number,
                nfse_series=req.nfse_series,
                motivo=req.justificativa,
                cfg=cfg,
            )
            if cfg.assinatura:
                if not req.pfx:
                    raise PayloadError("O município exige XML assinado e a empresa não tem certificado A1 ativo.")
                from nfe_gateway.nfse.providers.ipm.sign import sign_ipm_xml

                xml = sign_ipm_xml(root, pfx=req.pfx)
            else:
                xml = serialize(root)
        except PayloadError as exc:
            return {**base, "outcome": "rejected", "error_message": str(exc), "x_motivo": str(exc)}

        try:
            resp = ipm_client.post_xml(
                url=cfg.base_url,
                xml=xml,
                credentials=req.credentials,
                timeout=cfg.timeout_seconds,
                file_field=cfg.file_field,
            )
        except ipm_client.IpmTransportError as exc:
            return {**base, "outcome": "rejected", "signed_xml": xml, "error_message": str(exc), "x_motivo": str(exc)}

        ret = parse_retorno(resp.content)
        out = {**base, "signed_xml": xml, "response_xml": resp.content, "http_status": resp.status_code}
        if ret.parse_error:
            return {**out, "outcome": "rejected", "error_message": ret.parse_error, "x_motivo": ret.parse_error}
        if ret.is_success_code or ret.situacao_codigo == "2":
            return {**out, "outcome": "accepted", "cstat": "135",
                    "x_motivo": ret.message_text or "NFS-e cancelada", "protocol": ret.numero_nfse}
        code = _code(ret, f"http_{resp.status_code}")
        msg = ret.message_text or f"IPM recusou o cancelamento (HTTP {resp.status_code})."
        return {**out, "outcome": "rejected", "cstat": code, "error_message": msg, "x_motivo": msg}
