"""NFS-e Nacional event builders (pedRegEvento) for SEFIN."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from lxml import etree

from nfe_gateway.nfse.dps import NS, NSMAP, VER_APLIC

BRASILIA = timezone(timedelta(hours=-3))
CANCEL_EVENT = "101101"
CANCEL_DESC = "Cancelamento de NFS-e"
VALID_CANCEL_MOTIVOS = frozenset({"1", "2", "9"})


def _now_brasilia() -> datetime:
    return datetime.now(BRASILIA)


def build_cancel_pedido_id(*, chave: str) -> str:
    """Anexo II SEFIN: PRE + chave(50) + tipoEvento(6) = 59 chars."""
    chave_digits = "".join(c for c in chave if c.isalnum()).upper()
    if len(chave_digits) != 50:
        raise ValueError("NFS-e access key must have exactly 50 characters")
    return f"PRE{chave_digits}{CANCEL_EVENT}"


def build_cancel_ped_reg_evento(
    *,
    chave: str,
    cnpj: str,
    c_motivo: str,
    x_motivo: str,
    homologacao: bool,
) -> etree._Element:
    """Build unsigned pedRegEvento XML for cancelamento (e101101)."""
    motivo = str(c_motivo).strip()
    if motivo not in VALID_CANCEL_MOTIVOS:
        raise ValueError("c_motivo must be 1 (erro emissão), 2 (serviço não prestado) or 9 (outros)")
    justificativa = x_motivo.strip()
    if len(justificativa) < 15:
        raise ValueError("x_motivo must be at least 15 characters")
    if len(justificativa) > 255:
        justificativa = justificativa[:255]

    chave_digits = "".join(c for c in chave if c.isalnum()).upper()
    if len(chave_digits) != 50:
        raise ValueError("NFS-e access key must have exactly 50 characters")
    cnpj_digits = "".join(c for c in cnpj if c.isdigit())
    if len(cnpj_digits) != 14:
        raise ValueError("CNPJ must have 14 digits")

    ped_id = build_cancel_pedido_id(chave=chave_digits)
    dh = _now_brasilia().strftime("%Y-%m-%dT%H:%M:%S-03:00")

    root = etree.Element(f"{{{NS}}}pedRegEvento", nsmap=NSMAP, versao="1.01")
    inf = etree.SubElement(root, f"{{{NS}}}infPedReg", Id=ped_id)
    etree.SubElement(inf, f"{{{NS}}}tpAmb").text = "2" if homologacao else "1"
    etree.SubElement(inf, f"{{{NS}}}verAplic").text = VER_APLIC
    etree.SubElement(inf, f"{{{NS}}}dhEvento").text = dh
    etree.SubElement(inf, f"{{{NS}}}CNPJAutor").text = cnpj_digits
    etree.SubElement(inf, f"{{{NS}}}chNFSe").text = chave_digits

    det = etree.SubElement(inf, f"{{{NS}}}e101101")
    etree.SubElement(det, f"{{{NS}}}xDesc").text = CANCEL_DESC
    etree.SubElement(det, f"{{{NS}}}cMotivo").text = motivo
    etree.SubElement(det, f"{{{NS}}}xMotivo").text = justificativa
    return root


def ped_reg_xml_bytes(root: etree._Element) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")


def parse_evento_response(payload: dict[str, Any] | bytes, *, http_status: int = 201) -> dict[str, Any]:
    """Normalize SEFIN event POST response into gateway event_result shape."""
    if isinstance(payload, (bytes, bytearray)):
        try:
            root = etree.fromstring(payload)
        except etree.XMLSyntaxError:
            return {
                "outcome": "rejected",
                "event_kind": "cancel",
                "cstat": str(http_status),
                "x_motivo": "invalid event response XML",
                "protocol": None,
            }

        def find_text(*names: str) -> str | None:
            for el in root.iter():
                if etree.QName(el).localname in names and el.text:
                    return el.text
            return None

        return {
            "outcome": "accepted",
            "event_kind": "cancel",
            "cstat": find_text("cStat") or "135",
            "x_motivo": find_text("xMotivo") or "Evento registrado",
            "protocol": find_text("Id", "nProt", "idEvento"),
            "response_xml": bytes(payload),
        }

    # JSON success body from SEFIN (eventoXmlGZipB64 already decoded by caller optionally)
    return {
        "outcome": "accepted",
        "event_kind": "cancel",
        "cstat": "135",
        "x_motivo": "Evento registrado e vinculado a NFS-e",
        "protocol": str(payload.get("idEvento") or payload.get("id_evento") or ""),
        "raw": payload,
    }
