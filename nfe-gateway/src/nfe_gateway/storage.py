"""Reads/writes the same object store the Go backend uses for payloads
(`internal/platform/storage`), so the raw XML never travels through
RabbitMQ — only the storage key does (see 08_messaging_and_workers.md).

Only 'local' (filesystem, matching backend's STORAGE_LOCAL_PATH for dev) is
implemented for now; an Azure Blob backend mirrors whatever the backend's
`internal/platform/storage` uses in production and should be added together
with that config, not guessed at here.
"""

from __future__ import annotations

from pathlib import Path


class ObjectStore:
    async def get(self, object_key: str) -> bytes:
        raise NotImplementedError

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        raise NotImplementedError


class LocalObjectStore(ObjectStore):
    def __init__(self, base_path: str):
        self._base = Path(base_path)

    async def get(self, object_key: str) -> bytes:
        return (self._base / object_key).read_bytes()

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        path = self._base / object_key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def build_object_store(backend: str, local_path: str) -> ObjectStore:
    if backend == "local":
        return LocalObjectStore(local_path)
    raise NotImplementedError(f"storage backend {backend!r} not implemented yet — see storage.py")
