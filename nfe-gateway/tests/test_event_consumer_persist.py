"""Tests for cancel event XML persistence in the event consumer."""

from __future__ import annotations

import pytest

from nfe_gateway.workers.event_consumer import (
    _envelope,
    _persist_event_xmls,
    _storage_base_key,
)


class MemoryStore:
    def __init__(self) -> None:
        self.puts: list[tuple[str, str, bytes]] = []

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        self.puts.append((object_key, content_type, data))

    async def get(self, object_key: str) -> bytes:
        for key, _, data in self.puts:
            if key == object_key:
                return data
        raise KeyError(object_key)


@pytest.mark.asyncio
async def test_persist_event_xmls_writes_request_and_response():
    store = MemoryStore()
    keys = await _persist_event_xmls(
        store,
        base_key="fiscal/docs/abc",
        event_kind="cancel",
        signed_xml=b"<pedido/>",
        response_xml="<evento/>",
    )
    assert keys["request_object_key"] == "fiscal/docs/abc.cancel_request.xml"
    assert keys["response_object_key"] == "fiscal/docs/abc.cancel_response.xml"
    assert len(store.puts) == 2
    assert store.puts[0][1] == "application/xml"
    assert store.puts[0][2] == b"<pedido/>"
    assert store.puts[1][2] == b"<evento/>"


@pytest.mark.asyncio
async def test_persist_inutilization_uses_suffix():
    store = MemoryStore()
    keys = await _persist_event_xmls(
        store,
        base_key="fiscal/docs/xyz",
        event_kind="inutilization",
        signed_xml=b"<inut/>",
        response_xml=b"<retInut/>",
    )
    assert keys["request_object_key"] == "fiscal/docs/xyz.inutilization_request.xml"
    assert keys["response_object_key"] == "fiscal/docs/xyz.inutilization_response.xml"


@pytest.mark.asyncio
async def test_persist_cce_sequence_keys():
    store = MemoryStore()
    first = await _persist_event_xmls(
        store,
        base_key="fiscal/docs/k",
        event_kind="cce",
        signed_xml=b"<cce1/>",
        response_xml=b"<ret1/>",
        n_seq_evento=1,
    )
    second = await _persist_event_xmls(
        store,
        base_key="fiscal/docs/k",
        event_kind="cce",
        signed_xml=b"<cce2/>",
        response_xml=b"<ret2/>",
        n_seq_evento=2,
    )
    assert first["response_object_key"] == "fiscal/docs/k.cce_response.xml"
    assert second["request_object_key"] == "fiscal/docs/k.cce_2_request.xml"
    assert second["response_object_key"] == "fiscal/docs/k.cce_2_response.xml"


def test_storage_base_key_prefers_payload_object_key():
    assert (
        _storage_base_key(
            {"payload_object_key": "fiscal/org/doc.json", "organization_company_id": "x"},
            "doc-id",
        )
        == "fiscal/org/doc.json"
    )


def test_envelope_strips_raw_xml_keeps_object_keys():
    import uuid

    org = uuid.uuid4()
    env = _envelope(
        org,
        "doc-1",
        event_type="fiscal.document.cancel_requested.v1",
        outcome="accepted",
        signed_xml=b"<x/>",
        response_xml=b"<y/>",
        request_object_key="k1.cancel_request.xml",
        response_object_key="k1.cancel_response.xml",
        protocol="EVT123",
    )
    data = env["data"]
    assert "signed_xml" not in data
    assert "response_xml" not in data
    assert data["request_object_key"] == "k1.cancel_request.xml"
    assert data["response_object_key"] == "k1.cancel_response.xml"
    assert data["protocol"] == "EVT123"
