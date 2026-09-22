"""SEFAZ HTTP transport with TLS verification enabled.

Upstream PyNFe calls ``requests.post(..., verify=False)`` in every
``ComunicacaoSefaz._post``. That disables server authentication.

We keep verification ON, but SEFAZ/SVRS (and most Brazilian gov endpoints)
present certificates chained to ICP-Brasil roots, which are **not** in the
default Mozilla/certifi bundle. Using only ``certifi.where()`` causes
``CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate`` and
blocks legitimate SEFAZ TLS — without meaning the A1 client cert is invalid.

``certifi_icpbr`` = Mozilla CAs + ICP-Brasil roots (ITI). Verification stays
strict; we only widen the trust store to the Brazilian PKI.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import certifi_icpbr
import requests
from lxml import etree
from pynfe.entidades.certificado import CertificadoA1
from pynfe.processamento.comunicacao import ComunicacaoSefaz

logger = logging.getLogger("nfe_gateway.sefaz.tls")


def sefaz_ca_bundle() -> str:
    """CA bundle that trusts both public CAs and ICP-Brasil (SEFAZ/SVRS)."""
    return certifi_icpbr.where()


class ComunicacaoSefazVerified(ComunicacaoSefaz):
    """Drop-in replacement for ComunicacaoSefaz with TLS server verification."""

    def _post(self, url: str, xml: Any, timeout: float | None = None):  # type: ignore[override]
        # Must match PyNFe signature: callers pass timeout positionally
        # (self._post(url, xml, timeout)). Also accepts a prebuilt SOAP str so
        # the signed NF-e is not re-serialized (cStat 297).
        certificado_a1 = CertificadoA1(self.certificado)
        chave, cert = certificado_a1.separar_arquivo(self.certificado_senha, caminho=True)
        chave_cert = (cert, chave)
        try:
            xml_declaration = '<?xml version="1.0" encoding="UTF-8"?>'
            if isinstance(xml, (bytes, bytearray)):
                xml_str = bytes(xml).decode("utf-8")
            elif isinstance(xml, str):
                xml_str = xml
            else:
                xml_str = re.sub(
                    "<qrCode>(.*?)</qrCode>",
                    lambda x: x.group(0)
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&amp;", ""),
                    etree.tostring(xml, encoding="unicode").replace("\n", ""),
                )
            if not xml_str.lstrip().startswith("<?xml"):
                xml_str = xml_declaration + xml_str
            result = requests.post(
                url,
                xml_str,
                headers=self._post_header(),
                cert=chave_cert,
                verify=sefaz_ca_bundle(),
                timeout=timeout,
            )
            result.encoding = "utf-8"
            return result
        except requests.exceptions.RequestException:
            raise
        finally:
            certificado_a1.excluir()
