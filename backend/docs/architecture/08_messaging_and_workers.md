# Mensageria e Workers

## Tópicos/filas

- `fiscal.document.received.v1`
- `fiscal.document.validation_requested.v1`
- `fiscal.document.transmission_requested.v1`
- `fiscal.document.status_changed.v1`
- `fiscal.document.requery_requested.v1`
- `fiscal.document.transmission_result.v1` — resposta do `nfe-gateway` a um `transmission_requested`, ver [22_nfe_gateway_service.md](22_nfe_gateway_service.md)
- `sefaz.distribution.rate_limited.v1` — alerta de circuit breaker na consulta de distribuição por NSU, ver [22_nfe_gateway_service.md](22_nfe_gateway_service.md)
- `webhook.delivery_requested.v1`
- `email.delivery_requested.v1`

## Envelope

```json
{
  "specversion": "1.0",
  "id": "uuid",
  "source": "fiscal_saas/inbound_api",
  "type": "fiscal.document.received.v1",
  "subject": "organization_documents/<uuid>",
  "time": "2026-07-19T18:00:00Z",
  "datacontenttype": "application/json",
  "traceparent": "...",
  "organization_id": "uuid",
  "data": {
    "document_id": "uuid"
  }
}
```

Evitar transportar XML fiscal completo na fila. Transportar IDs e buscar o conteúdo do storage.

## Entidades de confiabilidade

### `outbox_events`

Criado na mesma transação do documento.

Campos:

- `aggregate_type`
- `aggregate_id`
- `event_type`
- `payload_json`
- `status`
- `attempt_count`
- `available_at`
- `published_at`

### `inbox_events`

Deduplicação do consumidor:

- `consumer_name`
- `event_id`
- `processed_at`
- `result`

Unique: `(consumer_name, event_id)`.

### `dead_letter_events`

Evento, causa, stack sanitizada, contagem, data e ação administrativa.

## Regras do worker

- processamento idempotente;
- lock por documento/versão;
- concorrência controlada;
- retry apenas de erro transitório;
- erro funcional não deve virar retry infinito;
- exponential backoff com jitter;
- dead-letter após limite;
- heartbeat para tarefas longas;
- timeout por provedor;
- atualização de status transacional.
