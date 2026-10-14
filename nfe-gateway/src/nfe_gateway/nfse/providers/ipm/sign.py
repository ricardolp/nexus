"""XMLDSig opcional do layout IPM (``<nfse id="nota">``).

Só é usado quando o município exige assinatura (``provider_config.assinatura``).
W3C XMLDSig enveloped, referência ``#nota``, Signature antes do fechamento da
raiz. RSA-SHA1/C14N, o mesmo perfil das demais NFS-e/NF-e assinadas pelo
gateway.
"""

from __future__ import annotations

import signxml
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    pkcs12,
)
from lxml import etree
from pynfe.processamento.assinatura import CustomXMLSigner


def sign_ipm_xml(root: etree._Element, *, pfx: bytes) -> bytes:
    key, cert, _chain = pkcs12.load_key_and_certificates(pfx, None)
    if key is None or cert is None:
        raise ValueError("PFX sem chave privada ou certificado")
    key_pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    cert_pem = cert.public_bytes(Encoding.PEM)

    signer = CustomXMLSigner(
        method=signxml.methods.enveloped,
        signature_algorithm="rsa-sha1",
        digest_algorithm="sha1",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signer.namespaces = {None: signer.namespaces["ds"]}
    tree = etree.fromstring(etree.tostring(root))
    signed = signer.sign(
        tree,
        key=key_pem,
        cert=cert_pem.decode("ascii"),
        reference_uri="#nota",
        id_attribute="id",
    )
    return etree.tostring(signed, xml_declaration=True, encoding="UTF-8")
