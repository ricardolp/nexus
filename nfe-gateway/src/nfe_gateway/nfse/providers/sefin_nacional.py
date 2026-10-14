"""Provedor SEFIN Nacional (Sistema Nacional NFS-e): DPS assinada + mTLS A1.

Só embrulha o fluxo que já existia (``nfse/dps.py``, ``nfse/sefin.py``,
``nfse/events.py``) no contrato ``NfseProvider``.
"""

from __future__ import annotations

from typing import Any

from nfe_gateway.nfse.providers.base import (
    CancelRequest,
    EmitRequest,
    ProviderCapabilities,
)

_CAPS = ProviderCapabilities(
    needs_certificate=True,
    credentials="none",
    identifies_by="access_key",
    homologation="environment",
)


class SefinNacionalProvider:
    code = "sefin_nacional"

    def capabilities(self, config: dict[str, Any]) -> ProviderCapabilities:
        return _CAPS

    def emit(self, req: EmitRequest) -> dict[str, Any]:
        from nfe_gateway.nfse.transmit import transmit_dps

        if not req.pfx:
            raise ValueError("SEFIN Nacional exige o certificado A1 da empresa")
        return transmit_dps(req.payload, pfx=req.pfx, homologacao=req.homologacao)

    def cancel(self, req: CancelRequest) -> dict[str, Any]:
        from nfe_gateway.nfse.events import build_cancel_ped_reg_evento
        from nfe_gateway.nfse.sefin import post_evento
        from nfe_gateway.nfse.sign import sign_ped_reg_evento_xml

        if not req.pfx:
            raise ValueError("SEFIN Nacional exige o certificado A1 da empresa")
        unsigned = build_cancel_ped_reg_evento(
            chave=req.access_key,
            cnpj=req.cnpj,
            c_motivo=req.c_motivo or "1",
            x_motivo=req.justificativa,
            homologacao=req.homologacao,
        )
        signed = sign_ped_reg_evento_xml(unsigned, pfx=req.pfx)
        result = post_evento(
            chave=req.access_key,
            signed_xml=signed,
            pfx=req.pfx,
            homologacao=req.homologacao,
        )
        # Transport "error" vira rejected para o Go aplicar o status.
        if result.get("outcome") == "error":
            result = {**result, "outcome": "rejected"}
        result["event_kind"] = "cancel"
        result["signed_xml"] = signed
        return result
