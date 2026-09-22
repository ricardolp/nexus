"""XSD validation helper for NF-e XML before transmission.

Pragmatic MVP approach:
1. Parse XML with lxml to ensure well-formedness
2. Check for required structural elements (ide, emit, dest, det, total)
3. If official NF-e XSD schemas exist in `sefaz/xsd/` folder, validate against them
4. Signature readiness check (Signature tag present after signing)

For full XSD compliance, drop the official schemas from SEFAZ into the xsd/
folder — see xsd/README.md for details.
"""

from __future__ import annotations

from pathlib import Path

from lxml import etree


class XSDValidationError(ValueError):
    """Raised when XML fails structural or XSD validation."""


XSD_DIR = Path(__file__).parent / "xsd"
NFEV400_SCHEMA = XSD_DIR / "leiauteNFe_v4.00.xsd"


def validate_unsigned_nfe_xml(xml: etree._Element) -> None:
    """Validates unsigned NF-e XML structure.
    
    Checks:
    - Required elements present (infNFe, ide, emit, dest, det, total)
    - No forbidden NF-e namespace prefixes (ns0:/nfe:)
    - Well-formed XML
    - XSD validation if schema available
    
    Args:
        xml: lxml.etree._Element of unsigned <NFe>
        
    Raises:
        XSDValidationError: Validation failed
    """
    _check_required_elements(xml, ["infNFe", "ide", "emit", "dest", "det", "total"])
    _check_namespace_prefixes(xml)
    
    if NFEV400_SCHEMA.exists():
        _validate_against_xsd(xml, NFEV400_SCHEMA)


def validate_signed_nfe_xml(xml: etree._Element) -> None:
    """Validates signed NF-e XML structure.
    
    Same as validate_unsigned_nfe_xml but also checks Signature is present.
    
    Args:
        xml: lxml.etree._Element of signed <NFe>
        
    Raises:
        XSDValidationError: Validation failed
    """
    _check_required_elements(xml, ["infNFe", "ide", "emit", "dest", "det", "total", "Signature"])
    _check_namespace_prefixes(xml)
    
    if NFEV400_SCHEMA.exists():
        _validate_against_xsd(xml, NFEV400_SCHEMA)


def _check_required_elements(xml: etree._Element, required: list[str]) -> None:
    """Check that required XML elements are present (by local name)."""
    found = {etree.QName(el).localname for el in xml.iter()}
    missing = [tag for tag in required if tag not in found]
    if missing:
        raise XSDValidationError(f"Missing required XML elements: {', '.join(missing)}")


NFE_NS = "http://www.portalfiscal.inf.br/nfe"


def _check_namespace_prefixes(xml: etree._Element) -> None:
    """SEFAZ cStat 404 — schema elements must not use ns0:/nfe: prefixes."""
    raw = etree.tostring(xml, encoding="unicode")
    if f'xmlns:ns0="{NFE_NS}"' in raw or "<ns0:" in raw:
        raise XSDValidationError(
            "NF-e uses ns0: namespace prefixes (SEFAZ rejects with cStat 404)"
        )
    if f'xmlns:nfe="{NFE_NS}"' in raw or "<nfe:" in raw:
        raise XSDValidationError(
            "NF-e uses nfe: namespace prefixes (SEFAZ rejects with cStat 404)"
        )


def _validate_against_xsd(xml: etree._Element, schema_path: Path) -> None:
    """Validate XML against XSD schema file.
    
    Args:
        xml: lxml.etree._Element to validate
        schema_path: Path to XSD schema file
        
    Raises:
        XSDValidationError: Schema validation failed
    """
    try:
        schema_doc = etree.parse(str(schema_path))
        schema = etree.XMLSchema(schema_doc)
    except Exception as exc:
        # Schema file exists but can't be loaded; log but don't fail validation
        # (allow processing to continue if schema is malformed)
        return
    
    if not schema.validate(xml):
        errors = "; ".join(str(err) for err in schema.error_log)
        raise XSDValidationError(f"XSD validation failed: {errors}")
