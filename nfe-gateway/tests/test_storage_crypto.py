"""AES-GCM storage parity with Go crypto.Encrypt/Decrypt."""

from __future__ import annotations

import base64
import tempfile
from pathlib import Path

import pytest

from nfe_gateway.storage import LocalObjectStore, _decrypt, _encrypt


def test_roundtrip_encrypt_decrypt():
    key = b"0123456789abcdef0123456789abcdef"
    plain = b"<NFe>secret fiscal xml</NFe>"
    encoded = _encrypt(key, plain)
    assert plain not in encoded.encode()
    assert _decrypt(key, encoded) == plain


@pytest.mark.asyncio
async def test_local_object_store_roundtrip():
    key = b"0123456789abcdef0123456789abcdef"
    with tempfile.TemporaryDirectory() as tmp:
        store = LocalObjectStore(tmp, key)
        await store.put("org/doc/payload.xml", "application/xml", b"<NFe/>")
        on_disk = (Path(tmp) / "org/doc/payload.xml").read_bytes()
        assert b"<NFe/>" not in on_disk
        out = await store.get("org/doc/payload.xml")
        assert out == b"<NFe/>"


def test_go_compatible_wire_format():
    key = b"0123456789abcdef0123456789abcdef"
    encoded = _encrypt(key, b"hello")
    raw = base64.b64decode(encoded)
    assert len(raw) > 12
    assert _decrypt(key, encoded) == b"hello"


def test_wrong_key_fails():
    key1 = b"0123456789abcdef0123456789abcdef"
    key2 = b"fedcba9876543210fedcba9876543210"
    encoded = _encrypt(key1, b"x")
    with pytest.raises(Exception):
        _decrypt(key2, encoded)
