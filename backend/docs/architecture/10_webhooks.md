# Webhooks

## Entidades

### `organization_webhook_endpoints`

- `id`
- `organization_id`
- `organization_company_id` nullable
- `name`
- `url`
- `status`
- `secret_ref`
- `api_version`
- `timeout_ms`
- `max_attempts`
- `created_at`
- `updated_at`

### `organization_webhook_subscriptions`

- `webhook_endpoint_id`
- `event_type`
- `filters_json`
- `status`

### `webhook_events`

Evento lógico a entregar.

### `webhook_deliveries`

- `webhook_event_id`
- `webhook_endpoint_id`
- `attempt_number`
- `request_payload_id`
- `response_payload_id`
- `http_status`
- `duration_ms`
- `outcome`
- `next_attempt_at`
- `delivered_at`

## Assinatura

Headers:

```text
x_webhook_id
x_webhook_timestamp
x_webhook_signature
```

Assinatura conceitual:

```text
HMAC_SHA256(secret, timestamp + "." + raw_body)
```

O consumidor deve rejeitar timestamps antigos e deduplicar `x_webhook_id`.

## Entrega

- sucesso apenas para 2xx;
- 408, 425, 429 e 5xx geralmente transitórios;
- demais 4xx normalmente permanentes;
- backoff exponencial com jitter;
- replay manual auditado;
- desativação automática após falhas persistentes;
- rotação de segredo com período de sobreposição;
- URL validada contra SSRF;
- payload versionado.

## Eventos fiscais

- `fiscal.document.received.v1`
- `fiscal.document.processing.v1`
- `fiscal.document.authorized.v1`
- `fiscal.document.rejected.v1`
- `fiscal.document.cancelled.v1`
- `fiscal.document.failed.v1`
