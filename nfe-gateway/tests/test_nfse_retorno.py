"""IBS/CBS calculado pela SEFIN na NFS-e autorizada (infNFSe/IBSCBS)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from nfe_gateway.nfse.retorno import extract_ibscbs, extract_nfse_number
from nfe_gateway.nfse.sefin import gzip_b64, post_dps

FIXTURE = Path(__file__).parent / "fixtures" / "nfse_autorizada_ibscbs.xml"


def test_extract_ibscbs_from_authorized_nfse():
    data = extract_ibscbs(FIXTURE.read_bytes())
    assert data == {
        "cst": "000",
        "c_class_trib": "000001",
        "c_ind_op": "030101",
        "c_localidade_incid": "4106902",
        "x_localidade_incid": "Curitiba",
        "v_bc": "500.00",
        "p_ibs_uf": "0.10",
        "p_aliq_efet_uf": "0.10",
        "p_ibs_mun": "0.00",
        "p_aliq_efet_mun": "0.00",
        "p_cbs": "0.90",
        "p_aliq_efet_cbs": "0.90",
        "v_ibs_uf": "0.50",
        "v_ibs_mun": "0.00",
        "v_ibs": "0.50",
        "v_cbs": "4.50",
        "v_tot_nf": "500.00",
    }


def test_extract_nfse_number_from_authorized_xml():
    assert extract_nfse_number(FIXTURE.read_bytes()) == "3"
    padded = b"""<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS1">
      <nNFSe>0000000000003</nNFSe></infNFSe></NFSe>"""
    assert extract_nfse_number(padded) == "3"
    assert extract_nfse_number(b"<NFSe/>") == ""
    assert extract_nfse_number(None) == ""


def test_extract_ibscbs_ignores_dps_only_group():
    """A NFS-e without the SEFIN group returns None (the DPS group has no values)."""
    xml = b"""<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="x">
      <DPS><infDPS><IBSCBS><cIndOp>100301</cIndOp><valores><trib>
        <CST>000</CST><cClassTrib>000001</cClassTrib></trib></valores></IBSCBS></infDPS></DPS>
    </infNFSe></NFSe>"""
    assert extract_ibscbs(xml) is None


def test_extract_ibscbs_reads_cst_nested_in_legacy_gibscbs():
    """NFS-e authorized before NT 009 v1.01 kept CST inside trib/gIBSCBS."""
    xml = b"""<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe>
      <IBSCBS><valores><vBC>10.00</vBC></valores>
        <totCIBS><gIBS><vIBSTot>0.10</vIBSTot></gIBS><gCBS><vCBS>0.90</vCBS></gCBS></totCIBS>
      </IBSCBS>
      <DPS><infDPS><IBSCBS><cIndOp>100301</cIndOp><valores><trib><gIBSCBS>
        <CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS></infDPS></DPS>
    </infNFSe></NFSe>"""
    data = extract_ibscbs(xml)
    assert data is not None
    assert data["cst"] == "000"
    assert data["c_class_trib"] == "000001"


def test_extract_ibscbs_handles_garbage():
    assert extract_ibscbs(b"") is None
    assert extract_ibscbs(b"not xml") is None
    assert extract_ibscbs(None) is None


def test_post_dps_authorized_carries_sefin_ibscbs(monkeypatch):
    nfse = FIXTURE.read_bytes()

    class FakeResp:
        status_code = 201
        content = b"{}"
        reason = "Created"

        def json(self):
            return {"chaveAcesso": "4" * 50, "idDps": "DPS1", "nfseXmlGZipB64": gzip_b64(nfse)}

    session = MagicMock()
    session.post.return_value = FakeResp()
    from nfe_gateway.nfse import sefin as sefin_mod

    monkeypatch.setattr(sefin_mod, "_materialize_mtls_files", lambda pfx: (Path("k.pem"), Path("c.pem")))
    monkeypatch.setattr(sefin_mod, "_shred", lambda path: None)

    result = post_dps(signed_xml=b"<DPS/>", pfx=b"fake", homologacao=True, session=session)
    assert result["outcome"] == "authorized"
    assert result["number"] == "3"
    assert result["ibscbs"]["v_cbs"] == "4.50"
    assert result["ibscbs"]["v_ibs"] == "0.50"
