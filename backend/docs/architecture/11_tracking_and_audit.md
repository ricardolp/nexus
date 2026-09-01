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

- `id`
- `organization_id`
- `request_id`
- `correlation_id`
- `trace_id`
- `source`
- `method`
- `route_template`
- `client_id`
- `user_id`
- `organization_company_id`
- `started_at`
- `finished_at`
- `http_status`
- `duration_ms`
- `request_payload_id`
- `response_payload_id`
- `error_code`
- `ip_hash`
- `user_agent_sanitized`

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
