"""Optional Prometheus scrape endpoint.

Off by default so local multi-process runs do not collide on port 9090.
Set METRICS_PORT=9090 in Railway to expose /metrics on that port.
"""

from __future__ import annotations

import logging

from prometheus_client import start_http_server

logger = logging.getLogger("nfe_gateway.metrics")


def start_if_configured(port: int) -> None:
    if port <= 0:
        return
    start_http_server(port)
    logger.info("metrics listening", extra={"port": port})
