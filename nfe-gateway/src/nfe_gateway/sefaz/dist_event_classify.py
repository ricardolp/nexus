"""Classify DistDFe docZip payloads: inbound Ciência vs outbound document events.

Keeps the distribution poller from dumping every non-procNFe into the
pending-Ciência table (wrong for cancel/CC-e/manifestation on notes we issued).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from lxml import etree

# Issuer-side events (we or someone acting as emitente registered them).
ISSUER_TP_EVENTOS = frozenset(
    {
        "110110",  # Carta de Correção
        "110111",  # Cancelamento
        "110112",  # Cancelamento por substituição (rare)
        "110140",  # EPEC / related — treat as outbound if chave matches
    }
)

# Destinatário manifestation (registered against OUR outbound NF-e).
MANIFESTATION_TP_EVENTOS = frozenset(
    {
        "210200",  # Confirmação da Operação
        "210210",  # Ciência da Operação
        "210220",  # Desconhecimento da Operação
        "210240",  # Operação não Realizada
    }
)

TP_EVENTO_TO_MANIFESTATION = {
    "210200": "confirmacao_da_operacao",
    "210210": "ciencia_da_operacao",
    "210220": "desconhecimento_da_operacao",
    "210240": "operacao_nao_realizada",
}

TP_EVENTO_TO_KIND = {
    "110110": "cce",
    "110111": "cancel",
    "110112": "cancel",
    "110140": "epec",
    **{k: "manifestation" for k in MANIFESTATION_TP_EVENTOS},
}

Route = Literal["proc_nfe", "inbound_pending", "outbound_event", "skip"]


@dataclass(frozen=True)
class DistEventInfo:
    route: Route
    chave: str | None = None
    tp_evento: str | None = None
    event_kind: str | None = None
    manifestation_type: str | None = None
    protocol: str | None = None
    n_seq_evento: str | None = None
    justification: str | None = None
    dh_evento: str | None = None


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _child_text(root: etree._Element, name: str) -> str | None:
    for el in root.iter():
        if _local(el) == name and el.text:
            return el.text.strip()
    return None


def parse_dist_event(xml_bytes: bytes) -> DistEventInfo:
    """Parse resEvento / procEventoNFe (or similar) into routing metadata."""
    try:
        root = etree.fromstring(xml_bytes)
    except etree.XMLSyntaxError:
        return DistEventInfo(route="skip")

    chave = _child_text(root, "chNFe")
    tp = _child_text(root, "tpEvento")
    protocol = _child_text(root, "nProt")
    n_seq = _child_text(root, "nSeqEvento")
    dh = _child_text(root, "dhEvento")
    just = _child_text(root, "xJust") or _child_text(root, "xCorrecao")

    if not chave:
        return DistEventInfo(route="skip")

    if tp and tp in MANIFESTATION_TP_EVENTOS:
        return DistEventInfo(
            route="outbound_event",
            chave=chave,
            tp_evento=tp,
            event_kind="manifestation",
            manifestation_type=TP_EVENTO_TO_MANIFESTATION.get(tp),
            protocol=protocol,
            n_seq_evento=n_seq,
            justification=just,
            dh_evento=dh,
        )

    if tp and tp in ISSUER_TP_EVENTOS:
        return DistEventInfo(
            route="outbound_event",
            chave=chave,
            tp_evento=tp,
            event_kind=TP_EVENTO_TO_KIND.get(tp, "event"),
            protocol=protocol,
            n_seq_evento=n_seq,
            justification=just,
            dh_evento=dh,
        )

    # No tpEvento → likely resNFe (summary of an inbound note).
    if tp is None:
        return DistEventInfo(route="inbound_pending", chave=chave, protocol=protocol)

    # Unknown event type with a chave — do not pollute Ciência.
    return DistEventInfo(
        route="skip",
        chave=chave,
        tp_evento=tp,
        protocol=protocol,
        n_seq_evento=n_seq,
        dh_evento=dh,
    )


def classify_dist_document(*, schema: str, xml_bytes: bytes) -> DistEventInfo:
    schema_l = (schema or "").lower()
    if schema_l.startswith("procnfe"):
        return DistEventInfo(route="proc_nfe")

    info = parse_dist_event(xml_bytes)

    if schema_l.startswith("resnfe"):
        # Lightweight inbound summary — always Ciência queue.
        if info.chave:
            return DistEventInfo(route="inbound_pending", chave=info.chave, protocol=info.protocol)
        return DistEventInfo(route="skip")

    if schema_l.startswith("resevento") or schema_l.startswith("procevento"):
        return info

    # Unknown schema: if we parsed a known outbound event, keep that; else skip.
    if info.route == "outbound_event":
        return info
    if info.chave and info.tp_evento is None:
        return DistEventInfo(route="inbound_pending", chave=info.chave, protocol=info.protocol)
    return DistEventInfo(route="skip", chave=info.chave, tp_evento=info.tp_evento)
