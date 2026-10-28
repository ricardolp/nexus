"""NF-e XMLDSig namespace / base64 normalization for SEFAZ."""

from __future__ import annotations

import datetime

import signxml
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from lxml import etree
from pynfe.processamento.assinatura import CustomXMLSigner

from nfe_gateway.sefaz.assinatura import (
    DSIG_NS,
    NFE_NS,
    _compact_signature_base64,
    normalize_nfe_namespaces,
)


def _key_and_cert_pem() -> tuple[bytes, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TEST:00000000000000")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow() - datetime.timedelta(days=1))
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return key_pem, cert.public_bytes(serialization.Encoding.PEM).decode()


def _unsigned_nfe() -> etree._Element:
    root = etree.Element(f"{{{NFE_NS}}}NFe", nsmap={None: NFE_NS})
    inf = etree.SubElement(root, f"{{{NFE_NS}}}infNFe", Id="NFe123", versao="4.00")
    etree.SubElement(inf, f"{{{NFE_NS}}}ide")
    return normalize_nfe_namespaces(root)


def test_signature_uses_default_xmldsig_xmlns_not_ds_prefix():
    """SEFAZ-BA rejected ds:-prefixed Signature with cStat 290 (2); GRC uses default xmlns."""
    key, cert = _key_and_cert_pem()
    xml = _unsigned_nfe()
    signer = CustomXMLSigner(
        method=signxml.methods.enveloped,
        signature_algorithm="rsa-sha1",
        digest_algorithm="sha1",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signer.excise_empty_xmlns_declarations = True
    signer.namespaces = {None: DSIG_NS}
    signed = signer.sign(xml, key=key, cert=cert, reference_uri="#NFe123")
    _compact_signature_base64(signed)
    out = etree.tostring(signed, encoding="unicode")
    assert "<ds:Signature" not in out
    assert 'xmlns:ds="' not in out
    assert "<Signature xmlns=" in out
    assert 'xmlns:ns0="' not in out and "<ns0:" not in out
    x509_el = signed.find(f".//{{{DSIG_NS}}}X509Certificate")
    if x509_el is None:
        # signxml 5+ may leave child tags without expanded NS in the tree.
        x509_el = signed.find(".//{*}X509Certificate")
    assert x509_el is not None and (x509_el.text or "").strip()
    assert "\n" not in x509_el.text
    assert " " not in x509_el.text


def test_compact_signature_base64_strips_pem_wraps():
    root = etree.Element(f"{{{NFE_NS}}}NFe", nsmap={None: NFE_NS})
    sig = etree.SubElement(root, f"{{{DSIG_NS}}}Signature", nsmap={None: DSIG_NS})
    val = etree.SubElement(sig, f"{{{DSIG_NS}}}SignatureValue")
    val.text = "ABC\nDEF GHI"
    cert = etree.SubElement(sig, f"{{{DSIG_NS}}}X509Certificate")
    cert.text = "MIIE\nABCD"
    _compact_signature_base64(root)
    assert val.text == "ABCDEFGHI"
    assert cert.text == "MIIEABCD"
