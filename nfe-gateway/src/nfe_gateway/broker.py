"""aio-pika wrapper around the same `fiscal.events` topic exchange the Go
`internal/platform/broker/rabbitmq.go` publishes to.

Consumption is at-least-once, so every handler dedupes via a
`(consumer_name, event_id)` inbox table. Queues are declared with a dead-letter
exchange so poison messages are not lost silently.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import aio_pika
import asyncpg
from aio_pika import ExchangeType

from nfe_gateway.metrics import record_dlq

logger = logging.getLogger("nfe_gateway.broker")

Handler = Callable[[dict[str, Any]], Awaitable[None]]


class Broker:
    def __init__(self, url: str, exchange_name: str):
        self._url = url
        self._exchange_name = exchange_name
        self._dlx_name = f"{exchange_name}.dlx"
        self._connection: aio_pika.RobustConnection | None = None
        self._exchange: aio_pika.Exchange | None = None
        self._dlx: aio_pika.Exchange | None = None

    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._url)
        channel = await self._connection.channel()
        self._exchange = await channel.declare_exchange(
            self._exchange_name, ExchangeType.TOPIC, durable=True
        )
        self._dlx = await channel.declare_exchange(
            self._dlx_name, ExchangeType.TOPIC, durable=True
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()

    async def publish(self, routing_key: str, payload: dict[str, Any]) -> None:
        assert self._exchange is not None, "call connect() first"
        # Never put XML / PFX blobs into the broker
        safe = {
            k: v
            for k, v in payload.items()
            if k not in ("response_xml", "signed_xml", "pfx")
        }
        if isinstance(safe.get("data"), dict):
            safe["data"] = {
                k: v
                for k, v in safe["data"].items()
                if k not in ("response_xml", "signed_xml", "pfx")
            }
        message = aio_pika.Message(
            body=json.dumps(safe, default=str).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        await self._exchange.publish(message, routing_key=routing_key)

    async def consume(
        self,
        *,
        queue_name: str,
        routing_key: str,
        consumer_name: str,
        pool: asyncpg.Pool,
        handler: Handler,
    ) -> None:
        await self.consume_multi(
            queue_name=queue_name,
            routing_keys=[routing_key],
            consumer_name=consumer_name,
            pool=pool,
            handler=handler,
        )

    async def consume_multi(
        self,
        *,
        queue_name: str,
        routing_keys: list[str],
        consumer_name: str,
        pool: asyncpg.Pool,
        handler: Handler,
    ) -> None:
        assert self._connection is not None, "call connect() first"
        channel = await self._connection.channel()
        await channel.set_qos(prefetch_count=10)
        exchange = await channel.declare_exchange(
            self._exchange_name, ExchangeType.TOPIC, durable=True
        )
        await channel.declare_exchange(self._dlx_name, ExchangeType.TOPIC, durable=True)

        dlq_name = f"{queue_name}.dlq"
        dlq = await channel.declare_queue(dlq_name, durable=True)
        await dlq.bind(self._dlx_name, routing_key=queue_name)

        queue = await channel.declare_queue(
            queue_name,
            durable=True,
            arguments={
                "x-dead-letter-exchange": self._dlx_name,
                "x-dead-letter-routing-key": queue_name,
            },
        )
        for rk in routing_keys:
            await queue.bind(exchange, routing_key=rk)

        async with queue.iterator() as messages:
            async for message in messages:
                async with message.process(requeue=False, ignore_processed=True):
                    try:
                        envelope = json.loads(message.body)
                        event_id = envelope.get("id")
                        if await _already_processed(pool, consumer_name, event_id):
                            continue
                        await handler(envelope)
                        await _mark_processed(pool, consumer_name, event_id)
                    except Exception:
                        record_dlq(queue_name)
                        logger.exception("handler failed; message dead-lettered", extra={"queue": queue_name})
                        raise


async def _already_processed(pool: asyncpg.Pool, consumer_name: str, event_id: str) -> bool:
    if not event_id:
        return False
    row = await pool.fetchrow(
        "select 1 from nfe_gateway_inbox_events where consumer_name = $1 and event_id = $2",
        consumer_name,
        event_id,
    )
    return row is not None


async def _mark_processed(pool: asyncpg.Pool, consumer_name: str, event_id: str) -> None:
    if not event_id:
        return
    await pool.execute(
        "insert into nfe_gateway_inbox_events (consumer_name, event_id, processed_at) "
        "values ($1, $2, now()) on conflict do nothing",
        consumer_name,
        event_id,
    )
