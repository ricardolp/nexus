"""Transmit outbound NFS-e via SEFIN Nacional."""

from __future__ import annotations

import json
from typing import Any

from nfe_gateway.nfse.dps import SapNfseMapperError, build_unsigned_dps, dps_xml_bytes
from nfe_gateway.nfse.sefin import post_dps
from nfe_gateway.nfse.sign import sign_dps_xml
from nfe_gateway.sefaz.environment import resolve_homologacao


def transmit_nfse(
    *,
    environment: str,
    pfx: bytes,
    payload_bytes: bytes,
    force_homologacao: bool = True,
) -> dict[str, Any]:
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return {
            "outcome": "error",
            "error_code": "invalid_payload",
            "error_message": f"NFS-e payload is not valid JSON: {exc}",
        }

    homologacao = resolve_homologacao(environment, force_homologacao)
    try:
        unsigned = build_unsigned_dps(payload, homologacao=homologacao)
    except SapNfseMapperError as exc:
        return {
            "outcome": "rejected",
            "error_code": "mapper_error",
            "error_message": str(exc),
            "cstat": "mapper_error",
            "x_motivo": str(exc),
        }

    unsigned_bytes = dps_xml_bytes(unsigned)
    try:
        signed = sign_dps_xml(unsigned, pfx=pfx)
    except Exception as exc:  # noqa: BLE001
        return {
            "outcome": "error",
            "error_code": "sign_error",
            "error_message": str(exc),
            "signed_xml": unsigned_bytes,
            "response_xml": b"",
        }

    return post_dps(signed_xml=signed, pfx=pfx, homologacao=homologacao)
