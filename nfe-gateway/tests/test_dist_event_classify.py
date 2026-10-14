"""Unit tests for DistDFe event classification (inbound Ciência vs outbound)."""

from __future__ import annotations

from nfe_gateway.sefaz.dist_event_classify import classify_dist_document, parse_dist_event


PROC_EVENTO_CANCEL = b"""<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <evento>
    <infEvento>
      <chNFe>35240112345678000155550010000000011123456789</chNFe>
      <tpEvento>110111</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <dhEvento>2026-03-20T10:00:00-03:00</dhEvento>
      <detEvento><xJust>Erro de emissao na nota</xJust></detEvento>
    </infEvento>
  </evento>
  <retEvento><infEvento><nProt>135260000000001</nProt></infEvento></retEvento>
</procEventoNFe>
"""

PROC_EVENTO_REFUSA = b"""<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <evento>
    <infEvento>
      <chNFe>35240112345678000155550010000000011123456789</chNFe>
      <tpEvento>210240</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <detEvento><xJust>Mercadoria nao recebida</xJust></detEvento>
    </infEvento>
  </evento>
  <retEvento><infEvento><nProt>135260000000099</nProt></infEvento></retEvento>
</procEventoNFe>
"""

RES_NFE = b"""<?xml version="1.0" encoding="UTF-8"?>
<resNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <chNFe>35240199999999000155550010000000011123456789</chNFe>
  <nProt>135260000000010</nProt>
</resNFe>
"""

UNKNOWN_EVENT = b"""<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <evento>
    <infEvento>
      <chNFe>35240112345678000155550010000000011123456789</chNFe>
      <tpEvento>999999</tpEvento>
      <nSeqEvento>1</nSeqEvento>
    </infEvento>
  </evento>
</procEventoNFe>
"""


def test_proc_nfe_schema_routes_to_proc_nfe():
    info = classify_dist_document(schema="procNFe_v4.00", xml_bytes=b"<nfeProc/>")
    assert info.route == "proc_nfe"


def test_cancel_event_routes_to_outbound():
    info = classify_dist_document(schema="procEventoNFe_v1.00", xml_bytes=PROC_EVENTO_CANCEL)
    assert info.route == "outbound_event"
    assert info.event_kind == "cancel"
    assert info.tp_evento == "110111"
    assert info.protocol == "135260000000001"
    assert info.chave.endswith("000000011123456789")


def test_recipient_refusal_routes_to_outbound_manifestation():
    info = classify_dist_document(schema="procEventoNFe_v1.00", xml_bytes=PROC_EVENTO_REFUSA)
    assert info.route == "outbound_event"
    assert info.event_kind == "manifestation"
    assert info.manifestation_type == "operacao_nao_realizada"
    assert info.tp_evento == "210240"


def test_res_nfe_routes_to_inbound_pending():
    info = classify_dist_document(schema="resNFe_v1.01", xml_bytes=RES_NFE)
    assert info.route == "inbound_pending"
    assert info.chave is not None
    assert info.protocol == "135260000000010"


def test_unknown_event_is_skipped_not_ciencia():
    info = classify_dist_document(schema="procEventoNFe_v1.00", xml_bytes=UNKNOWN_EVENT)
    assert info.route == "skip"
    assert info.tp_evento == "999999"


def test_parse_dist_event_without_chave_skips():
    info = parse_dist_event(b"<procEventoNFe><tpEvento>110111</tpEvento></procEventoNFe>")
    assert info.route == "skip"
