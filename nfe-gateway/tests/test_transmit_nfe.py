"""Tests for NF-e transmission (client.py transmit_nfe)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest
from lxml import etree

from nfe_gateway.sefaz.client import PyNfeSefazClient

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sap_nfe_outbound.json"


@pytest.fixture
def sap_json_bytes():
    with FIXTURE_PATH.open("rb") as f:
        return f.read()


@pytest.fixture
def mock_pfx():
    return b"fake-pfx-data"


@pytest.fixture
def sefaz_client():
    return PyNfeSefazClient(force_homologacao=True)


def _signed_stub():
    return etree.fromstring(
        b'<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'
        b'<infNFe Id="NFe1"><ide/><emit/><dest/><det nItem="1"><prod/><imposto/></det>'
        b"<total/><Signature/></infNFe></NFe>"
    )


def _patch_sign_and_post(*, response_content: bytes):
    """Sign returns fixed XML string; SEFAZ _post returns HTTP 200 + body."""
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = response_content
    mock_response.text = response_content.decode("utf-8", errors="replace")

    mock_com = Mock()
    mock_com._get_url.return_value = "https://sefaz.example/ws"
    mock_com._post.return_value = mock_response

    signed = etree.tostring(_signed_stub(), encoding="unicode")
    return mock_com, signed, mock_response


@pytest.mark.asyncio
async def test_transmit_nfe_success_sync_response(sap_json_bytes, mock_pfx, sefaz_client):
    body = b"""<?xml version="1.0" encoding="utf-8"?>
    <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe">
        <cStat>104</cStat>
        <xMotivo>Lote processado</xMotivo>
        <protNFe>
            <infProt>
                <cStat>100</cStat>
                <xMotivo>Autorizado o uso da NF-e</xMotivo>
                <nProt>123456789012345</nProt>
                <chNFe>35260912345678000195550010000123451234567890</chNFe>
            </infProt>
        </protNFe>
    </retEnviNFe>"""
    mock_com, signed, _ = _patch_sign_and_post(response_content=body)

    with patch("nfe_gateway.sefaz.client.ephemeral_pfx_path") as mock_cert, patch(
        "nfe_gateway.sefaz.assinatura.assinar_nfe", return_value=signed
    ), patch("nfe_gateway.sefaz.client.Comunicacao", return_value=mock_com), patch(
        "asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **k: fn(*a, **k))
    ):
        mock_cert.return_value.__enter__ = Mock(return_value="/tmp/fake.pfx")
        mock_cert.return_value.__exit__ = Mock(return_value=False)

        result = await sefaz_client.transmit_nfe(
            uf="SP",
            environment="homologation",
            pfx=mock_pfx,
            payload_bytes=sap_json_bytes,
            content_type="application/json",
        )

    assert result["outcome"] == "authorized"
    assert result["protocol"] == "123456789012345"
    assert result["access_key"] == "35260912345678000195550010000123451234567890"
    assert result["cstat"] == "100"
    assert "signed_xml" in result
    assert mock_com._post.called
    soap_arg = mock_com._post.call_args.args[1]
    assert isinstance(soap_arg, str)
    assert "<Signature/>" in soap_arg or "<Signature" in soap_arg


@pytest.mark.asyncio
async def test_transmit_nfe_lote_104_reads_infprot(sap_json_bytes, mock_pfx, sefaz_client):
    body = b"""<?xml version="1.0" encoding="utf-8"?>
    <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe">
        <cStat>104</cStat>
        <xMotivo>Lote processado</xMotivo>
        <protNFe>
            <infProt>
                <cStat>778</cStat>
                <xMotivo>Rejeicao: Informado NCM inexistente</xMotivo>
                <chNFe>42260913677964000200550020000693421141507122</chNFe>
            </infProt>
        </protNFe>
    </retEnviNFe>"""
    mock_com, signed, _ = _patch_sign_and_post(response_content=body)

    with patch("nfe_gateway.sefaz.client.ephemeral_pfx_path") as mock_cert, patch(
        "nfe_gateway.sefaz.assinatura.assinar_nfe", return_value=signed
    ), patch("nfe_gateway.sefaz.client.Comunicacao", return_value=mock_com), patch(
        "asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **k: fn(*a, **k))
    ):
        mock_cert.return_value.__enter__ = Mock(return_value="/tmp/fake.pfx")
        mock_cert.return_value.__exit__ = Mock(return_value=False)

        result = await sefaz_client.transmit_nfe(
            uf="SC",
            environment="homologation",
            pfx=mock_pfx,
            payload_bytes=sap_json_bytes,
            content_type="application/json",
        )

    assert result["outcome"] == "rejected"
    assert result["cstat"] == "778"
    assert result["lote_cstat"] == "104"
    assert "NCM" in result["x_motivo"]


@pytest.mark.asyncio
async def test_transmit_nfe_rejected(sap_json_bytes, mock_pfx, sefaz_client):
    body = b"""<?xml version="1.0" encoding="utf-8"?>
    <retEnviNFe>
        <cStat>539</cStat>
        <xMotivo>CNPJ do emitente invalido</xMotivo>
    </retEnviNFe>"""
    mock_com, signed, _ = _patch_sign_and_post(response_content=body)

    with patch("nfe_gateway.sefaz.client.ephemeral_pfx_path") as mock_cert, patch(
        "nfe_gateway.sefaz.assinatura.assinar_nfe", return_value=signed
    ), patch("nfe_gateway.sefaz.client.Comunicacao", return_value=mock_com), patch(
        "asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **k: fn(*a, **k))
    ):
        mock_cert.return_value.__enter__ = Mock(return_value="/tmp/fake.pfx")
        mock_cert.return_value.__exit__ = Mock(return_value=False)

        result = await sefaz_client.transmit_nfe(
            uf="SP",
            environment="homologation",
            pfx=mock_pfx,
            payload_bytes=sap_json_bytes,
            content_type="application/json",
        )

    assert result["outcome"] == "rejected"
    assert result["cstat"] == "539"
    assert "CNPJ" in result["x_motivo"]


@pytest.mark.asyncio
async def test_transmit_nfe_204_recovers_via_consulta_chave(sap_json_bytes, mock_pfx, sefaz_client):
    chave = "42260913677964000200550020000693421415071225"
    autorizacao_body = b"""<?xml version="1.0" encoding="utf-8"?>
    <retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe">
        <cStat>204</cStat>
        <xMotivo>Rejeicao: Duplicidade de NF-e</xMotivo>
    </retEnviNFe>"""
    consulta_body = f"""<?xml version="1.0" encoding="utf-8"?>
    <retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <cStat>100</cStat>
        <xMotivo>Autorizado o uso da NF-e</xMotivo>
        <chNFe>{chave}</chNFe>
        <protNFe versao="4.00">
            <infProt>
                <chNFe>{chave}</chNFe>
                <nProt>142260000000888</nProt>
                <cStat>100</cStat>
                <xMotivo>Autorizado o uso da NF-e</xMotivo>
            </infProt>
        </protNFe>
    </retConsSitNFe>""".encode()

    mock_auth = Mock()
    mock_auth.status_code = 200
    mock_auth.content = autorizacao_body
    mock_auth.text = autorizacao_body.decode()

    mock_consulta = Mock()
    mock_consulta.status_code = 200
    mock_consulta.content = consulta_body
    mock_consulta.text = consulta_body.decode()

    mock_com = Mock()
    mock_com._get_url.return_value = "https://sefaz.example/ws"
    mock_com._post.return_value = mock_auth
    mock_com.consulta_nota.return_value = mock_consulta

    signed = (
        f'<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'
        f'<infNFe Id="NFe{chave}"><ide/><emit/><dest/>'
        f'<det nItem="1"><prod/><imposto/></det><total/><Signature/></infNFe></NFe>'
    )

    with patch("nfe_gateway.sefaz.client.ephemeral_pfx_path") as mock_cert, patch(
        "nfe_gateway.sefaz.assinatura.assinar_nfe", return_value=signed
    ), patch("nfe_gateway.sefaz.client.Comunicacao", return_value=mock_com), patch(
        "asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **k: fn(*a, **k))
    ):
        mock_cert.return_value.__enter__ = Mock(return_value="/tmp/fake.pfx")
        mock_cert.return_value.__exit__ = Mock(return_value=False)

        result = await sefaz_client.transmit_nfe(
            uf="SC",
            environment="homologation",
            pfx=mock_pfx,
            payload_bytes=sap_json_bytes,
            content_type="application/json",
        )

    assert result["outcome"] == "authorized"
    assert result["cstat"] == "100"
    assert result["protocol"] == "142260000000888"
    assert result["access_key"] == chave
    assert result.get("recovered_from_duplicidade") is True
    mock_com.consulta_nota.assert_called_once()
    assert mock_com.consulta_nota.call_args.args[1] == chave


@pytest.mark.asyncio
async def test_transmit_nfe_mapper_error(mock_pfx, sefaz_client):
    bad_json = b'{"invalid": "missing required fields"}'
    result = await sefaz_client.transmit_nfe(
        uf="SP",
        environment="homologation",
        pfx=mock_pfx,
        payload_bytes=bad_json,
        content_type="application/json",
    )
    assert result["outcome"] == "rejected"
    assert result["error_code"] == "mapper_error"
    assert "Failed to build NF-e XML" in result["error_message"]


@pytest.mark.asyncio
async def test_transmit_nfe_xsd_validation_error(sap_json_bytes, mock_pfx, sefaz_client):
    from nfe_gateway.sefaz.xsd_validate import XSDValidationError

    with patch(
        "nfe_gateway.sefaz.xsd_validate.validate_unsigned_nfe_xml",
        side_effect=XSDValidationError("Missing required element: ide"),
    ):
        result = await sefaz_client.transmit_nfe(
            uf="SP",
            environment="homologation",
            pfx=mock_pfx,
            payload_bytes=sap_json_bytes,
            content_type="application/json",
        )

    assert result["outcome"] == "rejected"
    assert result["error_code"] == "xsd_validation"
    assert "Missing required element" in result["error_message"]
