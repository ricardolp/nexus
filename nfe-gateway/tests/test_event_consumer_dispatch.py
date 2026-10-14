"""Tests for event_consumer dispatch: SEFAZ call shape and failure results."""

from __future__ import annotations

import contextlib
import uuid
from types import SimpleNamespace
from typing import Any

import pytest

from nfe_gateway.workers import event_consumer

CHAVE = "29260905523987000223550000000341601380639580"


class FakeResponse:
    content = b"<retEnvEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo></retEnvEvento>"


class FakeComunicacao:
    calls: list[tuple[Any, ...]] = []

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    def evento(self, modelo: str, evento: Any, id_lote: int = 1) -> FakeResponse:
        FakeComunicacao.calls.append((modelo, evento, id_lote))
        return FakeResponse()


class FakeSigner:
    def __init__(self, *args: Any) -> None:
        pass

    def assinar(self, xml: Any) -> Any:
        return xml


@contextlib.contextmanager
def _fake_pfx_path(_pfx: bytes):
    yield "cert.pfx"


class FakeBackend:
    async def get_signing_material(self, **_: Any) -> Any:
        return SimpleNamespace(pfx=b"pfx")


class FakeBroker:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict]] = []

    async def publish(self, key: str, envelope: dict) -> None:
        self.published.append((key, envelope))


class FakeStore:
    async def put(self, *_: Any) -> None:
        pass


def _envelope(event_type: str, **data: Any) -> dict:
    return {
        "type": event_type,
        "organization_id": str(uuid.uuid4()),
        "data": {
            "document_id": str(uuid.uuid4()),
            "organization_company_id": str(uuid.uuid4()),
            "document_type": "nfe",
            "environment": "homologation",
            "access_key": CHAVE,
            "cnpj": "05523987000223",
            "uf": "BA",
            **data,
        },
    }


@pytest.fixture(autouse=True)
def _patch_sefaz(monkeypatch):
    FakeComunicacao.calls = []
    monkeypatch.setattr(event_consumer, "ComunicacaoSefazVerified", FakeComunicacao)
    monkeypatch.setattr(event_consumer, "AssinaturaA1", FakeSigner)
    monkeypatch.setattr(event_consumer, "ephemeral_pfx_path", _fake_pfx_path)


@pytest.mark.asyncio
async def test_cancel_uses_protocolo_from_backend_and_nfe_model():
    broker = FakeBroker()
    await event_consumer.handle_event(
        _envelope(
            "fiscal.document.cancel_requested.v1",
            protocolo="129261000671135",
            justificativa="Cancelamento por erro de digitacao",
            n_seq_evento=1,
        ),
        backend=FakeBackend(),
        broker=broker,
        store=FakeStore(),
        force_homologacao=False,
    )
    assert FakeComunicacao.calls[0][0] == "nfe"
    data = broker.published[0][1]["data"]
    assert data["event_kind"] == "cancel"
    assert data["outcome"] == "accepted"


@pytest.mark.asyncio
async def test_cce_uses_nfe_model():
    broker = FakeBroker()
    await event_consumer.handle_event(
        _envelope(
            "fiscal.document.cce_requested.v1",
            correcao="Correcao do endereco do destinatario",
            n_seq_evento=1,
        ),
        backend=FakeBackend(),
        broker=broker,
        store=FakeStore(),
        force_homologacao=False,
    )
    assert FakeComunicacao.calls[0][0] == "nfe"
    assert broker.published[0][1]["data"]["event_kind"] == "cce"


@pytest.mark.asyncio
async def test_failure_publishes_error_result_instead_of_raising(monkeypatch):
    def boom(*_: Any, **__: Any) -> Any:
        raise RuntimeError("SEFAZ unreachable")

    monkeypatch.setattr(FakeComunicacao, "evento", boom)
    broker = FakeBroker()
    await event_consumer.handle_event(
        _envelope(
            "fiscal.document.cancel_requested.v1",
            protocolo="129261000671135",
            justificativa="Cancelamento por erro de digitacao",
        ),
        backend=FakeBackend(),
        broker=broker,
        store=FakeStore(),
        force_homologacao=False,
    )
    key, envelope = broker.published[0]
    assert key == event_consumer.RESULT_KEY
    data = envelope["data"]
    assert data["outcome"] == "error"
    assert data["event_kind"] == "cancel"
    assert "SEFAZ unreachable" in data["error_message"]
