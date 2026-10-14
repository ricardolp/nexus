"""Tests for ADN Parâmetros Municipais (convênio) client, cache and diagnosis."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from nfe_gateway.nfse import parametros
from nfe_gateway.nfse.parametros import (
    cached_convenio,
    diagnose_convenio,
    emitter_municipality,
    get_convenio,
    is_cnc_rejection,
)
from nfe_gateway.storage import ObjectStore
from nfe_gateway.workers.outbound_consumer import _attach_convenio_diagnosis

CNC_MSG = (
    "IM do emitente prestador não está autorizado a emitir NFS-e, conforme informações "
    "complementares registradas no CNC NFS-e do município emissor informado na DPS."
)


class MemoryStore(ObjectStore):
    def __init__(self) -> None:
        self.data: dict[str, bytes] = {}

    async def get(self, object_key: str) -> bytes:
        if object_key not in self.data:
            raise FileNotFoundError(object_key)
        return self.data[object_key]

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        self.data[object_key] = data


@pytest.fixture(autouse=True)
def _no_mtls_files(monkeypatch):
    monkeypatch.setattr(parametros, "_materialize_mtls_files", lambda pfx: (Path("."), Path(".")))
    monkeypatch.setattr(parametros, "_shred", lambda path: None)


def _session(status: int, body: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = body
    session = MagicMock()
    session.get.return_value = resp
    return session


def _convenio_body(rfb: int = 0, emissor: int = 1) -> dict:
    return {
        "mensagem": None,
        "parametrosConvenio": {
            "tipoConvenioDeserializationSetter": 1,
            "aderenteAmbienteNacional": 1,
            "aderenteEmissorNacional": emissor,
            "situacaoEmissaoPadraoContribuintesRFB": rfb,
            "aderenteMAN": 0,
            "permiteAproveitametoDeCreditos": False,
        },
    }


def test_get_convenio_homologacao_url_and_parse():
    session = _session(200, _convenio_body(rfb=0))
    result = get_convenio(codigo_municipio="2919553", pfx=b"x", homologacao=True, session=session)
    url = session.get.call_args.args[0]
    assert url == "https://adn.producaorestrita.nfse.gov.br/parametrizacao/2919553/convenio"
    assert result["found"] is True
    assert result["tipo_convenio"] == "1"
    assert result["aderente_emissor_nacional"] == "1"
    assert result["emissao_padrao_contribuintes_rfb"] == "0"


def test_get_convenio_production_url():
    session = _session(200, _convenio_body())
    get_convenio(codigo_municipio="2919553", pfx=b"x", homologacao=False, session=session)
    assert session.get.call_args.args[0] == "https://adn.nfse.gov.br/parametrizacao/2919553/convenio"


def test_get_convenio_not_found_keeps_mensagem():
    session = _session(404, {"mensagem": "Município não encontrado"})
    result = get_convenio(codigo_municipio="2919553", pfx=b"x", homologacao=True, session=session)
    assert result["found"] is False
    assert "não encontrado" in diagnose_convenio(result)


def test_get_convenio_rejects_bad_code():
    with pytest.raises(ValueError):
        get_convenio(codigo_municipio="123", pfx=b"x", homologacao=True, session=MagicMock())


def test_diagnose_requires_cnc_when_rfb_default_off():
    session = _session(200, _convenio_body(rfb=0))
    text = diagnose_convenio(get_convenio(codigo_municipio="2919553", pfx=b"x", homologacao=True, session=session))
    assert "homologação" in text
    assert "CNC" in text


def test_diagnose_omits_missing_tipo_convenio():
    body = _convenio_body(rfb=0)
    del body["parametrosConvenio"]["tipoConvenioDeserializationSetter"]
    session = _session(200, body)
    text = diagnose_convenio(get_convenio(codigo_municipio="2919553", pfx=b"x", homologacao=True, session=session))
    assert "tipo" not in text
    assert "emissão padrão pelo CNPJ da RFB não" in text


def test_diagnose_emissor_nacional_off():
    session = _session(200, _convenio_body(rfb=1, emissor=0))
    text = diagnose_convenio(get_convenio(codigo_municipio="2919553", pfx=b"x", homologacao=True, session=session))
    assert "não permite emissão" in text


def test_is_cnc_rejection():
    assert is_cnc_rejection(CNC_MSG)
    assert not is_cnc_rejection("Valor do serviço inválido")


def test_emitter_municipality_precedence():
    assert emitter_municipality({"prestador": {"codigo_municipio": "2919553"}, "servico": {"codigo_municipio": "1"}}) == "2919553"
    assert emitter_municipality({"prestador": {}, "servico": {"codigo_municipio": "3550308"}}) == "3550308"


async def test_cached_convenio_hits_network_once():
    store = MemoryStore()
    session = _session(200, _convenio_body())
    now = datetime(2026, 9, 27, 23, 0, tzinfo=timezone.utc)

    first = await cached_convenio(store, codigo_municipio="2919553", pfx=b"x", homologacao=True, now=now, session=session)
    second = await cached_convenio(
        store, codigo_municipio="2919553", pfx=b"x", homologacao=True, now=now + timedelta(hours=1), session=session
    )

    assert first["cached"] is False
    assert second["cached"] is True
    assert session.get.call_count == 1


async def test_cached_convenio_refreshes_after_ttl():
    store = MemoryStore()
    session = _session(200, _convenio_body())
    now = datetime(2026, 9, 27, 23, 0, tzinfo=timezone.utc)

    await cached_convenio(store, codigo_municipio="2919553", pfx=b"x", homologacao=True, now=now, session=session)
    await cached_convenio(
        store, codigo_municipio="2919553", pfx=b"x", homologacao=True, now=now + timedelta(hours=25), session=session
    )
    assert session.get.call_count == 2


async def test_cache_is_per_ambiente():
    store = MemoryStore()
    session = _session(200, _convenio_body())
    await cached_convenio(store, codigo_municipio="2919553", pfx=b"x", homologacao=True, session=session)
    await cached_convenio(store, codigo_municipio="2919553", pfx=b"x", homologacao=False, session=session)
    assert session.get.call_count == 2


async def test_attach_diagnosis_on_cnc_rejection(monkeypatch):
    store = MemoryStore()
    calls: list[str] = []

    async def fake_cached(store_, *, codigo_municipio, pfx, homologacao, **_):
        calls.append(codigo_municipio)
        return {
            "codigo_municipio": codigo_municipio,
            "ambiente": "homologacao",
            "found": True,
            "tipo_convenio": "1",
            "aderente_emissor_nacional": "1",
            "emissao_padrao_contribuintes_rfb": "0",
        }

    monkeypatch.setattr("nfe_gateway.workers.outbound_consumer.cached_convenio", fake_cached)
    result = {"outcome": "rejected", "error_message": CNC_MSG, "x_motivo": CNC_MSG}
    payload = json.dumps({"prestador": {"codigo_municipio": "2919553"}}).encode()

    await _attach_convenio_diagnosis(result, store=store, pfx=b"x", payload_bytes=payload, homologacao=True)

    assert calls == ["2919553"]
    assert result["error_message"].startswith(CNC_MSG)
    assert "Convênio 2919553" in result["error_message"]
    assert result["x_motivo"] == result["error_message"]


async def test_attach_diagnosis_skips_other_rejections(monkeypatch):
    async def boom(*args, **kwargs):
        raise AssertionError("must not query ADN")

    monkeypatch.setattr("nfe_gateway.workers.outbound_consumer.cached_convenio", boom)
    result = {"outcome": "rejected", "error_message": "Valor inválido"}
    await _attach_convenio_diagnosis(result, store=MemoryStore(), pfx=b"x", payload_bytes=b"{}", homologacao=True)
    assert result["error_message"] == "Valor inválido"


async def test_attach_diagnosis_never_breaks_on_failure(monkeypatch):
    async def fail(*args, **kwargs):
        raise RuntimeError("ADN down")

    monkeypatch.setattr("nfe_gateway.workers.outbound_consumer.cached_convenio", fail)
    result = {"outcome": "rejected", "error_message": CNC_MSG}
    payload = json.dumps({"prestador": {"codigo_municipio": "2919553"}}).encode()
    await _attach_convenio_diagnosis(result, store=MemoryStore(), pfx=b"x", payload_bytes=payload, homologacao=True)
    assert result["error_message"] == CNC_MSG
