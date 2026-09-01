"""aio-pika wrapper around the same `fiscal.events` topic exchange the Go
`internal/platform/broker/rabbitmq.go` publishes to (see the "Pré-requisito"
section of docs/architecture/22_nfe_gateway_service.md — that Go side does
not exist yet, this client assumes it does).

Consumption is at-least-once, so every handler dedupes via a
`(consumer_name, event_id)` inbox table — the same pattern already documented
for the Go workers in 08_messaging_and_workers.md.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

import aio_pika
import asyncpg

Handler = Callable[[dict[str, Any]], Awaitable[None]]


class Broker:
    def __init__(self, url: str, exchange_name: str):
        self._url = url
        self._exchange_name = exchange_name
        self._connection: aio_pika.RobustConnection | None = None
        self._exchange: aio_pika.Exchange | None = None

    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._url)
        channel = await self._connection.channel()
        self._exchange = await channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()

    async def publish(self, routing_key: str, payload: dict[str, Any]) -> None:
        assert self._exchange is not None, "call connect() first"
        message = aio_pika.Message(
            body=json.dumps(payload).encode("utf-8"),
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
        assert self._connection is not None, "call connect() first"
        channel = await self._connection.channel()
        await channel.set_qos(prefetch_count=10)
        exchange = await channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )
        queue = await channel.declare_queue(queue_name, durable=True)
        await queue.bind(exchange, routing_key=routing_key)

        async with queue.iterator() as messages:
            async for message in messages:
                async with message.process(requeue=True, ignore_processed=True):
                    envelope = json.loads(message.body)
                    event_id = envelope.get("id")
                    if await _already_processed(pool, consumer_name, event_id):
                        continue
                    await handler(envelope)
                    await _mark_processed(pool, consumer_name, event_id)


async def _already_processed(pool: asyncpg.Pool, consumer_name: str, event_id: str) -> bool:
    row = await pool.fetchrow(
        "select 1 from nfe_gateway_inbox_events where consumer_name = $1 and event_id = $2",
        consumer_name,
        event_id,
    )
    return row is not None


async def _mark_processed(pool: asyncpg.Pool, consumer_name: str, event_id: str) -> None:
    await pool.execute(
        "insert into nfe_gateway_inbox_events (consumer_name, event_id, processed_at) "
        "values ($1, $2, now()) on conflict do nothing",
        consumer_name,
        event_id,
    )
