"""Object store shared with the Go backend.

Local and S3 backends use the same AES-256-GCM wire format as
backend/internal/platform/crypto Encrypt/Decrypt:
  base64(nonce || ciphertext)
keyed by SECRETS_ENCRYPTION_KEY (exactly 32 bytes).
"""

from __future__ import annotations

import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class ObjectNotFoundError(FileNotFoundError):
    """The object key is registered, but the blob is not in the store."""

    def __init__(self, object_key: str):
        self.object_key = object_key
        super().__init__(object_key)


class ObjectStore:
    async def get(self, object_key: str) -> bytes:
        raise NotImplementedError

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        raise NotImplementedError


class LocalObjectStore(ObjectStore):
    def __init__(self, base_path: str, encryption_key: bytes):
        if len(encryption_key) != 32:
            raise ValueError("SECRETS_ENCRYPTION_KEY must be exactly 32 bytes for local object store")
        self._base = Path(base_path)
        self._key = encryption_key

    async def get(self, object_key: str) -> bytes:
        try:
            raw = (self._base / object_key).read_bytes()
        except FileNotFoundError as exc:
            raise ObjectNotFoundError(object_key) from exc
        return _decrypt(self._key, raw.decode("ascii"))

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        path = self._base / object_key
        path.parent.mkdir(parents=True, exist_ok=True)
        encoded = _encrypt(self._key, data)
        path.write_bytes(encoded.encode("ascii"))
        # content_type retained for API symmetry with Go; not stored on local FS


class S3ObjectStore(ObjectStore):
    """S3-compatible store (Railway Buckets). Encrypts before Put like LocalObjectStore."""

    def __init__(
        self,
        *,
        bucket: str,
        endpoint: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        encryption_key: bytes,
        force_path_style: bool = False,
    ):
        if len(encryption_key) != 32:
            raise ValueError("SECRETS_ENCRYPTION_KEY must be exactly 32 bytes for s3 object store")
        if not bucket or not endpoint or not access_key_id or not secret_access_key:
            raise ValueError("S3 bucket/endpoint/credentials are required")
        import boto3
        from botocore.config import Config

        self._bucket = bucket
        self._key = encryption_key
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint.rstrip("/"),
            region_name=region or "auto",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(s3={"addressing_style": "path" if force_path_style else "virtual"}),
        )

    async def get(self, object_key: str) -> bytes:
        import asyncio

        def _read() -> bytes:
            from botocore.exceptions import ClientError

            try:
                obj = self._client.get_object(Bucket=self._bucket, Key=object_key)
            except ClientError as exc:
                code = str((exc.response or {}).get("Error", {}).get("Code") or "")
                if code in {"NoSuchKey", "404", "NotFound"}:
                    raise ObjectNotFoundError(object_key) from exc
                raise
            raw = obj["Body"].read()
            return _decrypt(self._key, raw.decode("ascii"))

        return await asyncio.to_thread(_read)

    async def put(self, object_key: str, content_type: str, data: bytes) -> None:
        import asyncio

        encoded = _encrypt(self._key, data).encode("ascii")

        def _write() -> None:
            self._client.put_object(
                Bucket=self._bucket,
                Key=object_key,
                Body=encoded,
                ContentType=content_type or "application/octet-stream",
            )

        await asyncio.to_thread(_write)


def _encrypt(key: bytes, plaintext: bytes) -> str:
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    sealed = aesgcm.encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + sealed).decode("ascii")


def _decrypt(key: bytes, encoded: str) -> bytes:
    raw = base64.b64decode(encoded)
    if len(raw) < 12:
        raise ValueError("ciphertext too short")
    nonce, ciphertext = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ciphertext, None)


def _first_env(*names: str, default: str = "") -> str:
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return default


def build_object_store(backend: str, local_path: str, encryption_key: bytes | None = None) -> ObjectStore:
    kind = (backend or "local").strip().lower()
    if kind == "local":
        if encryption_key is None:
            raise ValueError("encryption_key required for local object store")
        return LocalObjectStore(local_path, encryption_key)
    if kind == "s3":
        if encryption_key is None:
            raise ValueError("encryption_key required for s3 object store")
        style = _first_env("AWS_S3_URL_STYLE", "S3_FORCE_PATH_STYLE").lower()
        force_path = style in {"path", "true", "1", "yes"}
        return S3ObjectStore(
            bucket=_first_env("S3_BUCKET", "AWS_S3_BUCKET_NAME", "BUCKET"),
            endpoint=_first_env("S3_ENDPOINT", "AWS_ENDPOINT_URL", "ENDPOINT"),
            region=_first_env("S3_REGION", "AWS_DEFAULT_REGION", "REGION", default="auto"),
            access_key_id=_first_env("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID"),
            secret_access_key=_first_env("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY"),
            encryption_key=encryption_key,
            force_path_style=force_path,
        )
    raise NotImplementedError(f"storage backend {backend!r} not implemented yet — see storage.py")
