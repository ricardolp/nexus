# Rastreamento, Auditoria e Timeline

## IDs

- `request_id`: uma chamada HTTP.
- `correlation_id`: fluxo lógico iniciado externamente.
- `trace_id`: trace distribuído.
- `document_id`: agregado fiscal.
- `event_id`: evento de domínio.
- `message_id`: mensagem no broker.
- `delivery_id`: tentativa de webhook.

Todos devem ser pesquisáveis.

## `request_traces`

Índice operacional e **Logs de Integração** (tenant UI em Integrações). Além dos campos de correlação/HTTP, a migration `048_integration_request_logs` adiciona `direction`, `origin`, `destination`, `level`, `summary`, headers sanitizados e previews de body/response. Ver [entities/request_traces.md](entities/request_traces.md).

Campos históricos do desenho:

- `id`
- `organization_id`
- `correlation_id`
- `trace_id`
- `span_name` / source
- `http_method` / `http_path`
- `started_at` / `finished_at`
- `http_status`
- `duration_ms`
- refs de payload (`storage_object_key`, `request_payload_key`, `response_payload_key`)

## `audit_events`

Auditoria imutável para ações administrativas e de negócio:

- quem;
- em qual tenant;
- ação;
- entidade;
- estado anterior;
- estado posterior;
- motivo;
- ticket;
- IP;
- sessão;
- timestamp.

Nunca registrar segredo, senha, token, seed MFA ou certificado privado.

## Timeline do documento

A tela de suporte deve apresentar:

1. recebido pela API;
2. validado;
3. persistido;
4. publicado na fila;
5. consumido pelo worker;
6. transmitido;
7. resposta recebida;
8. status alterado;
9. webhook criado;
10. webhook entregue ou falhou.

Cada etapa deve apontar para payloads permitidos, tentativas e traces.
