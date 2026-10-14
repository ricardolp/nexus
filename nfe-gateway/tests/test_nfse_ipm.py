"""Provedor IPM (Atende.Net) — mapper, IBS/CBS, retorno, emit/cancel e worker."""

from __future__ import annotations

import datetime
import json
import uuid
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from lxml import etree

from nfe_gateway.nfse.providers import registry
from nfe_gateway.nfse.providers.base import (
    CancelRequest,
    EmitRequest,
    ProviderCredentials,
)
from nfe_gateway.nfse.providers.ipm import IpmProvider
from nfe_gateway.nfse.providers.ipm import client as ipm_client
from nfe_gateway.nfse.providers.ipm.mapper import (
    IpmConfig,
    build_emission,
    serialize,
    situacao_tributaria,
)
from nfe_gateway.nfse.providers.ipm.retorno import (
    looks_like_test_validation,
    parse_retorno,
)
from nfe_gateway.nfse.providers.municipios import ibge_to_tom
from nfe_gateway.nfse.providers.payload import PayloadError, normalize_item_lista

GARUVA = "4205803"
JOINVILLE = "4209102"
URL = "https://garuva.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao"
CREDS = ProviderCredentials(username="12345678000123", password="segredo")


def _payload(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "data_emissao": "2026-10-14T10:30:00-03:00",
        "natureza_operacao": "1",
        "serie_rps": "1",
        "numero_rps": "1001",
        "optante_simples_nacional": False,
        "prestador": {"cnpj": "12345678000123", "inscricao_municipal": "1234", "codigo_municipio": GARUVA},
        "tomador": {
            "cnpj": "98765432000188",
            "razao_social": 'Cliente "Teste" D\'Agua / Filial',
            "email": "fiscal@cliente.com.br",
            "telefone": "4733334444",
            "endereco": {
                "logradouro": "Rua XV de Novembro",
                "numero": "100",
                "bairro": "Centro",
                "codigo_municipio": JOINVILLE,
                "uf": "SC",
                "cep": "89201-000",
            },
        },
        "servico": {
            "valor_servicos": 1000.00,
            "iss_retido": False,
            "aliquota": 0.02,
            "item_lista_servico": "17.01",
            "codigo_tributario_municipio": "691250000",
            "discriminacao": "Assessoria contábil 10/2026",
            "codigo_municipio": GARUVA,
        },
    }
    for key, value in over.items():
        base[key] = value
    return base


def _cfg(**over: Any) -> IpmConfig:
    return IpmConfig.from_dict({"base_url": URL, "item_lista_format": "nacional_6", **over})


def _text(root: etree._Element, path: str) -> str | None:
    el = root.find(path)
    return el.text if el is not None else None


# --------------------------------------------------------------------------- mapper


def test_tom_table_matches_ipm_examples():
    assert ibge_to_tom("4202909") == "8055"  # Brusque — exemplo da NTE 35/2021
    assert ibge_to_tom(GARUVA) == "8115"
    assert ibge_to_tom("123") == ""


def test_emission_maps_canonical_payload_to_ipm_layout():
    em = build_emission(_payload(), _cfg(), homologacao=False, document_id="doc-1")
    root = em.root
    assert root.tag == "nfse"
    assert root.find("nfse_teste") is None
    assert root.get("id") is None
    assert _text(root, "identificador") == em.identificador
    assert em.identificador.startswith("nexus-doc-1-")
    assert _text(root, "nf/data_fato_gerador") == "14/10/2026"
    assert _text(root, "nf/valor_total") == "1000,00"
    assert _text(root, "nf/serie_nfse") == "1"
    assert _text(root, "prestador/cpfcnpj") == "12345678000123"
    assert _text(root, "prestador/cidade") == "8115"
    assert _text(root, "tomador/tipo") == "J"
    assert _text(root, "tomador/cidade") == "8179"
    assert _text(root, "tomador/cep") == "89201000"
    assert _text(root, "tomador/ddd_fone_comercial") == "47"
    assert _text(root, "tomador/fone_comercial") == "33334444"
    assert "/" not in (_text(root, "tomador/nome_razao_social") or "")
    lista = root.find("itens/lista")
    assert _text(lista, "codigo_local_prestacao_servico") == "8115"
    assert _text(lista, "codigo_item_lista_servico") == "170101"
    assert _text(lista, "codigo_atividade") == "691250000"
    assert _text(lista, "aliquota_item_lista_servico") == "2,00"
    assert _text(lista, "situacao_tributaria") == "0"
    assert _text(lista, "tributa_municipio_prestador") == "S"
    assert _text(lista, "valor_issrf") == "0,00"
    assert _text(lista, "descritivo") == "Assessoria contábil 10-2026"
    assert root.find("rps") is None


def test_homologacao_adds_test_flag_right_after_root():
    em = build_emission(_payload(), _cfg(), homologacao=True, document_id="doc-1")
    assert em.root[0].tag == "nfse_teste"
    assert em.root[0].text == "1"


def test_identifier_is_stable_per_content_and_changes_with_content():
    a = build_emission(_payload(), _cfg(), homologacao=False, document_id="d").identificador
    b = build_emission(_payload(), _cfg(), homologacao=False, document_id="d").identificador
    p = _payload()
    p["servico"]["valor_servicos"] = 999
    c = build_emission(p, _cfg(), homologacao=False, document_id="d").identificador
    assert a == b
    assert a != c
    assert len(a) <= 80


def test_serialize_escapes_quotes_in_text_only():
    em = build_emission(_payload(), _cfg(assinatura=True), homologacao=False)
    raw = serialize(em.root)
    assert b'<nfse id="nota">' in raw
    assert b"Cliente &quot;Teste&quot; D&apos;Agua - Filial" in raw


def test_retained_iss_uses_substitution_and_computes_value():
    p = _payload()
    p["servico"]["iss_retido"] = True
    root = build_emission(p, _cfg(), homologacao=False).root
    assert _text(root, "itens/lista/situacao_tributaria") == "2"
    assert _text(root, "itens/lista/valor_issrf") == "20,00"


def test_situacao_tributaria_rules():
    assert situacao_tributaria({"natureza_operacao": "3"}, {}) == "6"
    assert situacao_tributaria({"natureza_operacao": "4"}, {}) == "7"
    assert situacao_tributaria({}, {"situacao_tributaria": "14"}) == "14"


def test_item_lista_formats():
    assert normalize_item_lista("17.01", fmt="lc116") == "1701"
    assert normalize_item_lista("17.01", fmt="nacional_6") == "170101"
    assert normalize_item_lista("210101", fmt="nacional_6") == "210101"
    assert normalize_item_lista("107", fmt="lc116") == "0107"


def test_rps_only_when_enabled():
    root = build_emission(_payload(), _cfg(enviar_rps=True), homologacao=False).root
    assert _text(root, "rps/nro_recibo_provisorio") == "1001"
    assert _text(root, "rps/data_emissao_recibo_provisorio") == "14/10/2026"


def test_missing_tomador_document_is_a_payload_error():
    p = _payload()
    p["tomador"].pop("cnpj")
    with pytest.raises(PayloadError):
        build_emission(p, _cfg(), homologacao=False)


def test_config_requires_base_url():
    from nfe_gateway.nfse.providers.base import ProviderConfigError

    with pytest.raises(ProviderConfigError):
        IpmConfig.from_dict({})


# --------------------------------------------------------------------------- IBS/CBS


def test_ibscbs_blocks_follow_nte_122_formulas():
    p = _payload()
    p["servico"].update(
        {
            "valor_pis": 6.5,
            "valor_cofins": 30,
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
            "codigo_indicador_operacao": "100301",
            "ibs_uf_aliquota": 0.1,
            "ibs_mun_aliquota": 0,
            "cbs_aliquota": 0.9,
        }
    )
    root = build_emission(p, _cfg(), homologacao=False).root
    # vBC = 1000 - 0 - ISS 20 - PIS 6,50 - COFINS 30 (2026)
    assert _text(root, "nf/IBSCBS/valores/vBC") == "943,50"
    assert _text(root, "nf/IBSCBS/valores/uf/pIBSUF") == "0,10"
    assert _text(root, "nf/IBSCBS/valores/fed/pAliqEfetCBS") == "0,90"
    assert _text(root, "nf/IBSCBS/totCIBS/gIBS/gIBSUFTot/vIBSUF") == "0,94"
    assert _text(root, "nf/IBSCBS/totCIBS/gCBS/vCBS") == "8,49"
    assert _text(root, "nf/IBSCBS/totCIBS/gIBS/vIBSTot") == "0,94"
    # 2026: vTotNF = vLiq
    assert _text(root, "nf/IBSCBS/totCIBS/vTotNF") == "1000,00"
    assert _text(root, "IBSCBS/cIndOp") == "100301"
    assert _text(root, "IBSCBS/valores/trib/gIBSCBS/CST") == "000"
    # Ordem: nf/IBSCBS dentro de nf; nfse/IBSCBS depois de itens.
    tags = [c.tag for c in root]
    assert tags.index("IBSCBS") > tags.index("itens")


def test_ibscbs_can_be_disabled_per_municipality():
    p = _payload()
    p["servico"].update({"ibs_cbs_situacao_tributaria": "000", "ibs_cbs_classificacao_tributaria": "000001"})
    root = build_emission(p, _cfg(ibscbs=False), homologacao=False).root
    assert root.find("IBSCBS") is None
    assert root.find("nf/IBSCBS") is None


def test_ibscbs_requires_cindop():
    p = _payload()
    p["servico"].update(
        {
            "item_lista_servico": "99.99",
            "ibs_cbs_situacao_tributaria": "000",
            "ibs_cbs_classificacao_tributaria": "000001",
            "ibs_uf_aliquota": 0.1,
            "ibs_mun_aliquota": 0,
            "cbs_aliquota": 0.9,
        }
    )
    with pytest.raises(PayloadError, match="cIndOp"):
        build_emission(p, _cfg(), homologacao=False)


# --------------------------------------------------------------------------- retorno

SUCESSO = """<?xml version="1.0" encoding="ISO-8859-1"?>
<retorno><mensagem><codigo>00001 - Sucesso</codigo></mensagem>
<numero_nfse>457</numero_nfse><serie_nfse>1</serie_nfse><data_nfse>14/10/2026</data_nfse>
<hora_nfse>10:31:02</hora_nfse><situacao_codigo_nfse>1</situacao_codigo_nfse>
<situacao_descricao_nfse>Emitida</situacao_descricao_nfse>
<link_nfse>https://garuva.atende.net/autoatendimento/servicos/nfse?pdf=abc</link_nfse>
<cod_verificador_autenticidade>ABCD1234EFGH</cod_verificador_autenticidade></retorno>""".encode("latin-1")

ERRO = """<retorno><mensagem><codigo>00052 - Item da lista de serviço inválido.</codigo>
<codigo>00030 - Alíquota inválida.</codigo></mensagem></retorno>""".encode()

TESTE_OK = """<retorno><mensagem><codigo>00999 - NFS-e válida para emissão (modo teste).</codigo></mensagem></retorno>""".encode()

LOGIN = b"<retorno><mensagem><codigo>00131 - Usuario ou senha incorretos</codigo></mensagem></retorno>"


def test_parse_success():
    ret = parse_retorno(SUCESSO)
    assert ret.is_success_code
    assert ret.numero_nfse == "457"
    assert ret.cod_verificador == "ABCD1234EFGH"
    assert ret.link_nfse.startswith("https://")


def test_parse_errors_keep_all_messages():
    ret = parse_retorno(ERRO)
    assert ret.first_code == 52
    assert "00052" in ret.message_text and "00030" in ret.message_text
    assert not looks_like_test_validation(ret)


def test_test_mode_validation_detected():
    assert looks_like_test_validation(parse_retorno(TESTE_OK))


def test_non_xml_response():
    assert parse_retorno(b"").parse_error


# --------------------------------------------------------------------------- emit / cancel


class _Recorder:
    def __init__(self, responses: list[Any]):
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def __call__(self, **kwargs: Any) -> ipm_client.IpmResponse:
        self.calls.append(kwargs)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _req(**over: Any) -> EmitRequest:
    base = {
        "payload": _payload(),
        "homologacao": False,
        "document_id": "doc-1",
        "config": {"base_url": URL, "item_lista_format": "nacional_6"},
        "credentials": CREDS,
    }
    base.update(over)
    return EmitRequest(**base)


def test_emit_authorized(monkeypatch):
    rec = _Recorder([ipm_client.IpmResponse(200, SUCESSO)])
    monkeypatch.setattr(ipm_client, "post_xml", rec)
    result = IpmProvider().emit(_req())
    assert result["outcome"] == "authorized"
    assert result["number"] == "457"
    assert result["verification_code"] == "ABCD1234EFGH"
    assert result["access_key"] == ""
    assert result["pdf_url"].startswith("https://")
    assert rec.calls[0]["url"] == URL
    assert rec.calls[0]["credentials"] is CREDS
    assert b"<nfse>" in rec.calls[0]["xml"]


def test_emit_rejected_with_prefixed_code(monkeypatch):
    monkeypatch.setattr(ipm_client, "post_xml", _Recorder([ipm_client.IpmResponse(200, ERRO)]))
    result = IpmProvider().emit(_req())
    assert result["outcome"] == "rejected"
    assert result["error_code"] == "ipm_00052"


def test_emit_login_error_hints_credentials(monkeypatch):
    monkeypatch.setattr(ipm_client, "post_xml", _Recorder([ipm_client.IpmResponse(200, LOGIN)]))
    result = IpmProvider().emit(_req())
    assert result["outcome"] == "rejected"
    assert "usuário/senha" in result["error_message"]


def test_emit_homologacao_never_authorizes(monkeypatch):
    rec = _Recorder([ipm_client.IpmResponse(200, TESTE_OK)])
    monkeypatch.setattr(ipm_client, "post_xml", rec)
    result = IpmProvider().emit(_req(homologacao=True))
    assert result["outcome"] == "rejected"
    assert result["error_code"] == "homologacao_validada"
    assert b"<nfse_teste>1</nfse_teste>" in rec.calls[0]["xml"]


def test_emit_timeout_is_retry(monkeypatch):
    monkeypatch.setattr(
        ipm_client, "post_xml", _Recorder([ipm_client.IpmTransportError("IPM não respondeu (ReadTimeout)")])
    )
    result = IpmProvider().emit(_req())
    assert result["outcome"] == "retry"
    assert result["signed_xml"]


def test_emit_without_credentials_is_error_without_network(monkeypatch):
    monkeypatch.setattr(ipm_client, "post_xml", _Recorder([]))
    result = IpmProvider().emit(_req(credentials=None))
    assert result["outcome"] == "error"
    assert result["error_code"] == "provider_credentials_missing"


def test_emit_mapper_error_is_rejected(monkeypatch):
    p = _payload()
    p["servico"].pop("discriminacao")
    monkeypatch.setattr(ipm_client, "post_xml", _Recorder([]))
    result = IpmProvider().emit(_req(payload=p))
    assert result["outcome"] == "rejected"
    assert result["error_code"] == "mapper_error"


def test_capabilities():
    caps = IpmProvider().capabilities({"base_url": URL})
    assert caps.credentials == "basic"
    assert caps.identifies_by == "number"
    assert not caps.needs_certificate
    assert IpmProvider().capabilities({"base_url": URL, "assinatura": True}).needs_certificate


def test_cancel_accepted(monkeypatch):
    rec = _Recorder([ipm_client.IpmResponse(200, b"<retorno><mensagem><codigo>00001 - Sucesso</codigo></mensagem></retorno>")])
    monkeypatch.setattr(ipm_client, "post_xml", rec)
    result = IpmProvider().cancel(
        CancelRequest(
            homologacao=False,
            config={"base_url": URL},
            cnpj="12345678000123",
            municipality_code=GARUVA,
            nfse_number="457",
            nfse_series="1",
            justificativa="Serviço não foi prestado ao tomador",
            credentials=CREDS,
        )
    )
    assert result["outcome"] == "accepted"
    xml = etree.fromstring(rec.calls[0]["xml"])
    assert _text(xml, "nf/numero") == "457"
    assert _text(xml, "nf/situacao") == "C"
    assert _text(xml, "prestador/cidade") == "8115"


def test_cancel_requires_number(monkeypatch):
    monkeypatch.setattr(ipm_client, "post_xml", _Recorder([]))
    result = IpmProvider().cancel(
        CancelRequest(homologacao=False, config={"base_url": URL}, cnpj="12345678000123",
                      municipality_code=GARUVA, justificativa="Serviço não foi prestado", credentials=CREDS)
    )
    assert result["outcome"] == "rejected"


# --------------------------------------------------------------------------- assinatura


def _pfx() -> bytes:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "EMPRESA TESTE:12345678000123")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    return pkcs12.serialize_key_and_certificates(b"t", key, cert, None, serialization.NoEncryption())


def test_signed_xml_references_nota(monkeypatch):
    rec = _Recorder([ipm_client.IpmResponse(200, SUCESSO)])
    monkeypatch.setattr(ipm_client, "post_xml", rec)
    req = _req(config={"base_url": URL, "item_lista_format": "nacional_6", "assinatura": True}, pfx=_pfx())
    result = IpmProvider().emit(req)
    assert result["outcome"] == "authorized"
    root = etree.fromstring(rec.calls[0]["xml"])
    assert root.get("id") == "nota"
    sig = root[-1]
    assert etree.QName(sig).localname == "Signature"
    ref = sig.find(".//{http://www.w3.org/2000/09/xmldsig#}Reference")
    assert ref.get("URI") == "#nota"


# --------------------------------------------------------------------------- registry / worker


def test_registry_defaults_to_sefin_and_rejects_unknown():
    assert registry.get_provider(None).code == "sefin_nacional"
    assert registry.get_provider("IPM").code == "ipm"
    with pytest.raises(registry.UnknownProviderError):
        registry.get_provider("betha")


class _Store:
    def __init__(self, payload: dict[str, Any]):
        self.objects: dict[str, bytes] = {"orig.json": json.dumps(payload).encode()}

    async def get(self, key: str) -> bytes:
        return self.objects[key]

    async def put(self, key: str, _ct: str, data: bytes) -> None:
        self.objects[key] = data


class _Backend:
    def __init__(self) -> None:
        self.signing_calls = 0
        self.credential_calls: list[str] = []
        self.logs: list[dict[str, Any]] = []

    async def get_signing_material(self, **_: Any) -> Any:
        self.signing_calls += 1
        return SimpleNamespace(pfx=b"pfx")

    async def get_nfse_credentials(self, *, provider_code: str, **_: Any) -> ProviderCredentials:
        self.credential_calls.append(provider_code)
        return CREDS

    async def record_integration_log(self, **kwargs: Any) -> None:
        self.logs.append(kwargs)


class _Broker:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict]] = []

    async def publish(self, key: str, envelope: dict) -> None:
        self.published.append((key, envelope))


@pytest.mark.asyncio
async def test_outbound_worker_routes_to_ipm_and_stores_pdf(monkeypatch):
    from nfe_gateway.workers import outbound_consumer

    monkeypatch.setattr(ipm_client, "post_xml", _Recorder([ipm_client.IpmResponse(200, SUCESSO)]))
    monkeypatch.setattr(ipm_client, "download_pdf", lambda **_: b"%PDF-1.4 fake")
    store, backend, broker = _Store(_payload()), _Backend(), _Broker()
    envelope = {
        "organization_id": str(uuid.uuid4()),
        "data": {
            "document_id": str(uuid.uuid4()),
            "organization_company_id": str(uuid.uuid4()),
            "document_type": "nfse",
            "environment": "production",
            "payload_object_key": "orig.json",
            "nfse_provider": "ipm",
            "nfse_provider_config": {"base_url": URL, "item_lista_format": "nacional_6"},
        },
    }
    await outbound_consumer.handle_transmission_requested(
        envelope, backend=backend, store=store, sefaz=None, broker=broker, force_homologacao=False
    )
    data = broker.published[0][1]["data"]
    assert data["outcome"] == "authorized"
    assert data["number"] == "457"
    assert data["provider_code"] == "ipm"
    assert data["pdf_object_key"] == "orig.json.provider_pdf.pdf"
    assert store.objects["orig.json.provider_pdf.pdf"].startswith(b"%PDF")
    assert store.objects["orig.json.provider_request.xml"].startswith(b"<?xml")
    assert backend.signing_calls == 0  # IPM sem assinatura não pede o A1
    assert backend.credential_calls == ["ipm"]
    assert backend.logs[0]["destination"] == "nfse_ipm"


@pytest.mark.asyncio
async def test_event_worker_cancels_through_ipm(monkeypatch):
    from nfe_gateway.workers import event_consumer

    rec = _Recorder([ipm_client.IpmResponse(200, b"<retorno><mensagem><codigo>00001 - Sucesso</codigo></mensagem></retorno>")])
    monkeypatch.setattr(ipm_client, "post_xml", rec)
    backend, broker = _Backend(), _Broker()
    envelope = {
        "type": "fiscal.document.cancel_requested.v1",
        "organization_id": str(uuid.uuid4()),
        "data": {
            "document_id": str(uuid.uuid4()),
            "organization_company_id": str(uuid.uuid4()),
            "document_type": "nfse",
            "environment": "production",
            "cnpj": "12345678000123",
            "municipality_code": GARUVA,
            "nfse_number": "457",
            "nfse_series": "1",
            "justificativa": "Serviço não foi prestado ao tomador",
            "nfse_provider": "ipm",
            "nfse_provider_config": {"base_url": URL},
        },
    }

    class _EvStore:
        async def put(self, *_: Any) -> None:
            pass

    await event_consumer.handle_event(envelope, backend=backend, broker=broker, store=_EvStore(), force_homologacao=False)
    data = broker.published[0][1]["data"]
    assert data["event_kind"] == "cancel"
    assert data["outcome"] == "accepted"
    assert backend.signing_calls == 0


def test_decimal_helpers_accept_ptbr_strings():
    from nfe_gateway.nfse.providers.payload import decimal

    assert decimal("1.234,56") == Decimal("1234.56")
    assert decimal("1234.56") == Decimal("1234.56")


@pytest.mark.asyncio
async def test_event_worker_legacy_nfse_cancel_goes_to_sefin(monkeypatch):
    """Evento antigo (sem nfse_provider) continua indo para a SEFIN Nacional com o A1."""
    from nfe_gateway.nfse.providers.sefin_nacional import SefinNacionalProvider
    from nfe_gateway.workers import event_consumer

    seen: dict[str, Any] = {}

    def fake_cancel(self, req):
        seen["access_key"] = req.access_key
        seen["pfx"] = req.pfx
        return {"outcome": "accepted", "event_kind": "cancel", "cstat": "135"}

    monkeypatch.setattr(SefinNacionalProvider, "cancel", fake_cancel)
    backend, broker = _Backend(), _Broker()
    chave = "4205803" + "2" * 43
    envelope = {
        "type": "fiscal.document.cancel_requested.v1",
        "organization_id": str(uuid.uuid4()),
        "data": {
            "document_id": str(uuid.uuid4()),
            "organization_company_id": str(uuid.uuid4()),
            "document_type": "nfse",
            "environment": "homologation",
            "access_key": chave,
            "cnpj": "12345678000123",
            "c_motivo": "1",
            "justificativa": "Erro na emissão da nota fiscal",
        },
    }

    class _EvStore:
        async def put(self, *_: Any) -> None:
            pass

    await event_consumer.handle_event(envelope, backend=backend, broker=broker, store=_EvStore(), force_homologacao=True)
    assert broker.published[0][1]["data"]["outcome"] == "accepted"
    assert seen == {"access_key": chave, "pfx": b"pfx"}
    assert backend.signing_calls == 1
    assert backend.credential_calls == []
