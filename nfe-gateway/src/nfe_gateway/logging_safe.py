"""Structured logging helpers — never log XML, PFX, or recipient emails."""

from __future__ import annotations

import logging
import re
from typing import Any

_SENSITIVE_KEYS = frozenset({
    "response_xml",
    "signed_xml",
    "pfx",
    "password",
    "client_secret",
    "email_destinatario",
    "email",
    "xml",
})
_CNPJ_RE = re.compile(r"\b\d{14}\b")
_CHAVE_RE = re.compile(r"\b\d{44}\b")


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("[redacted]" if k.lower() in _SENSITIVE_KEYS else redact(v)) for k, v in value.items()}
    if isinstance(value, str):
        if len(value) > 500 and ("<" in value or "NFe" in value):
            return f"[xml omitted len={len(value)}]"
        value = _CHAVE_RE.sub(lambda m: m.group(0)[:8] + "…" + m.group(0)[-4:], value)
        return value
    return value


def bind_logger(name: str, **fields: Any) -> logging.LoggerAdapter:
    return logging.LoggerAdapter(logging.getLogger(name), redact(fields))
