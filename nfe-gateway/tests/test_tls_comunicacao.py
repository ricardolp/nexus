"""ComunicacaoSefazVerified must accept PyNFe's positional _post(url, xml, timeout)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from lxml import etree

from nfe_gateway.sefaz.tls_comunicacao import ComunicacaoSefazVerified


def test_post_accepts_positional_timeout():
    com = ComunicacaoSefazVerified("SC", "/tmp/fake.pfx", "secret", homologacao=True)
    xml = etree.fromstring(b"<root><qrCode>&lt;x&gt;</qrCode></root>")

    fake_cert = MagicMock()
    fake_cert.separar_arquivo.return_value = ("/tmp/key.pem", "/tmp/cert.pem")

    fake_resp = MagicMock()
    fake_resp.encoding = None

    with (
        patch("nfe_gateway.sefaz.tls_comunicacao.CertificadoA1", return_value=fake_cert),
        patch("nfe_gateway.sefaz.tls_comunicacao.requests.post", return_value=fake_resp) as post,
        patch.object(com, "_post_header", return_value={"Content-Type": "application/soap+xml"}),
    ):
        # PyNFe autorizacao calls: self._post(url, xml, timeout)
        out = com._post("https://sefaz.example/ws", xml, 45)

    assert out is fake_resp
    assert post.call_args.kwargs["timeout"] == 45
    verify_path = post.call_args.kwargs["verify"]
    assert isinstance(verify_path, str) and verify_path.endswith(".pem")
    # Must trust ICP-Brasil (not plain Mozilla/certifi alone).
    from nfe_gateway.sefaz.tls_comunicacao import sefaz_ca_bundle

    assert verify_path == sefaz_ca_bundle()
    fake_cert.excluir.assert_called_once()


def test_post_without_timeout_still_works():
    com = ComunicacaoSefazVerified("SC", "/tmp/fake.pfx", "secret", homologacao=True)
    xml = etree.fromstring(b"<root/>")

    fake_cert = MagicMock()
    fake_cert.separar_arquivo.return_value = ("/tmp/key.pem", "/tmp/cert.pem")
    fake_resp = MagicMock()

    with (
        patch("nfe_gateway.sefaz.tls_comunicacao.CertificadoA1", return_value=fake_cert),
        patch("nfe_gateway.sefaz.tls_comunicacao.requests.post", return_value=fake_resp) as post,
        patch.object(com, "_post_header", return_value={}),
    ):
        com._post("https://sefaz.example/ws", xml)

    assert post.call_args.kwargs["timeout"] is None
