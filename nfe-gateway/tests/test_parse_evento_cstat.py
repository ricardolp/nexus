from nfe_gateway.sefaz.events import parse_evento_cstat

_ENVELOPE = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>'
    '<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">'
    '<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">'
    "<idLote>1</idLote><tpAmb>2</tpAmb><cOrgao>29</cOrgao>"
    "<cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo>"
    '<retEvento versao="1.00"><infEvento Id="ID1">{inf}</infEvento></retEvento>'
    "</retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>"
)


def test_uses_event_cstat_not_batch_cstat_on_rejection():
    xml = _ENVELOPE.format(
        inf="<cStat>187</cStat><xMotivo>Rejeicao: CNPJ do Autor nao cadastrado</xMotivo>"
    ).encode()
    parsed = parse_evento_cstat(xml)
    assert parsed["cstat"] == "187"
    assert parsed["x_motivo"].startswith("Rejeicao")
    assert parsed["outcome"] == "rejected"


def test_accepts_registered_event():
    xml = _ENVELOPE.format(
        inf="<cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo>"
        "<nProt>129261000000001</nProt>"
    ).encode()
    parsed = parse_evento_cstat(xml)
    assert parsed["cstat"] == "135"
    assert parsed["protocol"] == "129261000000001"
    assert parsed["outcome"] == "accepted"
