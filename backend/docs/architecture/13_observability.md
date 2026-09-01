# Observabilidade

## OpenTelemetry

Propagar `traceparent` entre:

- API Gateway;
- inbound API;
- banco;
- outbox relay;
- broker;
- workers;
- chamadas a provedor;
- webhook dispatcher.

## Métricas

- documentos recebidos por tipo/tenant;
- documentos autorizados/rejeitados;
- latência fim a fim;
- tempo em cada status;
- profundidade das filas;
- idade da mensagem mais antiga;
- retries e dead-letter;
- webhooks com falha;
- taxa de 401/403/429;
- erros por integração;
- consumo por organização;
- object storage e banco;
- disponibilidade e saturação.

Evitar labels de alta cardinalidade como `document_id` em métricas.

## Logs

Logs estruturados JSON com:

- timestamp;
- level;
- service;
- environment;
- trace_id;
- correlation_id;
- organization_id pseudonimizado;
- document_id;
- event;
- outcome;
- error_code.

Payload bruto não entra em log.

## SLOs iniciais

Exemplos:

- disponibilidade da API: 99,9%;
- aceitação do documento: p95 abaixo de 500 ms, excluindo upload muito grande;
- publicação de outbox: 99% abaixo de 10 s;
- webhook: primeira tentativa abaixo de 30 s após mudança;
- RPO e RTO definidos por plano.
