"""Prometheus metrics for SEFAZ / broker observability."""

from __future__ import annotations

import logging

from prometheus_client import Counter, Histogram, start_http_server

logger = logging.getLogger("nfe_gateway.metrics")

SEFAZ_CALLS = Counter(
    "nfe_gateway_sefaz_calls_total",
    "SEFAZ SOAP calls",
    ["operation", "uf", "result"],
)
SEFAZ_LATENCY = Histogram(
    "nfe_gateway_sefaz_latency_seconds",
    "SEFAZ SOAP call latency",
    ["operation"],
    buckets=(0.5, 1, 2, 5, 10, 20, 40, 60),
)
DLQ_MESSAGES = Counter(
    "nfe_gateway_dlq_messages_total",
    "Messages dead-lettered after handler failure",
    ["queue"],
)
TRANSMISSION_OUTCOMES = Counter(
    "nfe_gateway_transmission_outcomes_total",
    "Outbound transmission outcomes",
    ["outcome"],
)


def start_if_configured(port: int) -> None:
    if port <= 0:
        return
    start_http_server(port)
    logger.info("metrics listening", extra={"port": port})


def record_sefaz_call(*, operation: str, uf: str, ok: bool, seconds: float | None = None) -> None:
    SEFAZ_CALLS.labels(operation=operation, uf=uf, result="ok" if ok else "error").inc()
    if seconds is not None:
        SEFAZ_LATENCY.labels(operation=operation).observe(seconds)


def record_dlq(queue: str) -> None:
    DLQ_MESSAGES.labels(queue=queue).inc()


def record_transmission_outcome(outcome: str) -> None:
    TRANSMISSION_OUTCOMES.labels(outcome=outcome or "unknown").inc()
