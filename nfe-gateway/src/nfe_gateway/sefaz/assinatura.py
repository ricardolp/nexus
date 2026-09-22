"""NF-e XMLDSig with SEFAZ-safe namespaces (no ns0: on schema elements).

PyNFe's ``AssinaturaA1`` sets ``signer.namespaces = {None: xmldsig}``, which
makes lxml/signxml emit the NF-e namespace as ``xmlns:ns0`` and prefix every
schema element (``ns0:detPag``, …). SEFAZ rejects that with cStat 404.

We rebuild the unsigned tree with ``nsmap={None: NFE_NS}`` (no string ``xmlns``
hacks — those cause ``Attribute xmlns redefined``) and sign with an explicit
``ds:`` prefix for XMLDSig. The signed string is returned as-is (never
rebuilt after signing, or the digest breaks → cStat 297).
"""

from __future__ import annotations

import signxml
from lxml import etree
from pynfe.entidades.certificado import CertificadoA1
from pynfe.processamento.assinatura import CustomXMLSigner
from pynfe.utils import remover_acentos

NFE_NS = "http://www.portalfiscal.inf.br/nfe"
DSIG_NS = "http://www.w3.org/2000/09/xmldsig#"


def normalize_nfe_namespaces(xml: etree._Element) -> etree._Element:
    """Rebuild NF-e tree so schema elements use default xmlns only (no prefixes).

    Never string-replaces ``xmlns`` (that produces ``Attribute xmlns redefined``).
    Signature / xmldsig subtrees are deep-copied unchanged.
    """
    return _rebuild_nfe_element(xml, is_root=True)


def _is_dsig(el: etree._Element) -> bool:
    ns = etree.QName(el).namespace
    local = etree.QName(el).localname
    return ns == DSIG_NS or local == "Signature"


def _copy_attrs(src: etree._Element, dst: etree._Element) -> None:
    for key, value in src.attrib.items():
        if key == "xmlns" or key.startswith("xmlns:"):
            continue
        if key.startswith("{http://www.w3.org/2000/xmlns/}"):
            continue
        dst.set(key, value)


def _rebuild_nfe_element(src: etree._Element, *, is_root: bool = False) -> etree._Element:
    if _is_dsig(src):
        return etree.fromstring(etree.tostring(src))

    local = etree.QName(src).localname
    if is_root:
        dst = etree.Element(f"{{{NFE_NS}}}{local}", nsmap={None: NFE_NS})
    else:
        dst = etree.Element(f"{{{NFE_NS}}}{local}")

    _copy_attrs(src, dst)
    dst.text = src.text
    dst.tail = src.tail

    for child in src:
        if _is_dsig(child):
            dst.append(etree.fromstring(etree.tostring(child)))
        else:
            dst.append(_rebuild_nfe_element(child, is_root=False))

    return dst


def assert_no_nfe_namespace_prefixes(xml_str: str) -> None:
    """Fail fast if NF-e schema elements would be rejected with cStat 404."""
    if f'xmlns:ns0="{NFE_NS}"' in xml_str or "<ns0:" in xml_str:
        raise ValueError("NF-e XML contains ns0: prefixes (SEFAZ cStat 404)")
    if f'xmlns:nfe="{NFE_NS}"' in xml_str or "<nfe:" in xml_str:
        raise ValueError("NF-e XML contains nfe: prefixes (SEFAZ cStat 404)")


def assinar_nfe(xml: etree._Element, cert_path: str, senha: str = "") -> str:
    """Sign ``infNFe`` and return Unicode XML safe for SEFAZ (default NF-e xmlns)."""
    xml = normalize_nfe_namespaces(xml)

    id_node = xml.find(".//*[@Id]")
    if id_node is None:
        raise ValueError("NF-e XML missing Id attribute for signature reference")
    reference = id_node.attrib["Id"]

    # Accent fold (same as PyNFe), then rebuild namespaces again after reparse.
    xml_str = remover_acentos(etree.tostring(xml, encoding="unicode", pretty_print=False))
    xml = normalize_nfe_namespaces(etree.fromstring(xml_str))
    assert_no_nfe_namespace_prefixes(etree.tostring(xml, encoding="unicode"))

    key, cert = CertificadoA1(cert_path).separar_arquivo(senha)

    signer = CustomXMLSigner(
        method=signxml.methods.enveloped,
        signature_algorithm="rsa-sha1",
        digest_algorithm="sha1",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signer.excise_empty_xmlns_declarations = True
    signer.namespaces = {"ds": DSIG_NS}

    signed_root = signer.sign(xml, key=key, cert=cert, reference_uri=f"#{reference}")
    signed_str = etree.tostring(signed_root, encoding="unicode", pretty_print=False)
    assert_no_nfe_namespace_prefixes(signed_str)
    return signed_str
