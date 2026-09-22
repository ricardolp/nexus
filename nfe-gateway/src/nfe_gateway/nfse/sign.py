"""Sign DPS / pedRegEvento XML with the company A1 certificate."""

from __future__ import annotations

from lxml import etree
from pynfe.processamento.assinatura import AssinaturaA1

from nfe_gateway.sefaz.client import ephemeral_pfx_path


def _sign_tree(unsigned: etree._Element | bytes, *, pfx: bytes) -> bytes:
    if isinstance(unsigned, (bytes, bytearray)):
        tree = etree.fromstring(unsigned)
    else:
        tree = unsigned

    with ephemeral_pfx_path(pfx) as cert_path:
        signed = AssinaturaA1(cert_path, "").assinar(tree)

    if isinstance(signed, (bytes, bytearray)):
        return bytes(signed)
    if isinstance(signed, str):
        return signed.encode("utf-8")
    return etree.tostring(signed, xml_declaration=True, encoding="UTF-8")


def sign_dps_xml(unsigned: etree._Element | bytes, *, pfx: bytes) -> bytes:
    """Return signed DPS XML bytes (XMLDSig enveloped on infDPS)."""
    return _sign_tree(unsigned, pfx=pfx)


def sign_ped_reg_evento_xml(unsigned: etree._Element | bytes, *, pfx: bytes) -> bytes:
    """Return signed pedRegEvento XML bytes (XMLDSig enveloped on infPedReg)."""
    return _sign_tree(unsigned, pfx=pfx)