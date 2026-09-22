"""Build SEFAZ autorizacao SOAP without re-serializing the signed NF-e.

Re-parsing / ``etree.tostring`` of an already-signed ``<NFe>`` inside the SOAP
envelope is a common cause of cStat 297 (Assinatura difere do calculado).
We keep the exact signed Unicode string and only wrap it.
"""

from __future__ import annotations

import re

_XML_DECL_RE = re.compile(r"^\s*<\?xml[^?]*\?>\s*", re.IGNORECASE)


def strip_xml_declaration(xml: str) -> str:
    return _XML_DECL_RE.sub("", xml, count=1).strip()


def build_nfe_autorizacao_soap(
    signed_nfe_xml: str,
    *,
    id_lote: int | str = 1,
    ind_sinc: int | str = 1,
) -> str:
    """Return a complete SOAP 1.2 envelope embedding ``signed_nfe_xml`` verbatim."""
    nfe = strip_xml_declaration(signed_nfe_xml)
    envi = (
        '<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">'
        f"<idLote>{int(id_lote)}</idLote>"
        f"<indSinc>{int(ind_sinc)}</indSinc>"
        f"{nfe}"
        "</enviNFe>"
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
        'xmlns:soap="http://www.w3.org/2003/05/soap-envelope">'
        "<soap:Body>"
        '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">'
        f"{envi}"
        "</nfeDadosMsg>"
        "</soap:Body>"
        "</soap:Envelope>"
    )
