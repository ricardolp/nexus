# Convenções de API

## Paths

```text
/v1/organizations
/v1/organizations/{organization_id}/members
/v1/organizations/{organization_id}/roles
/v1/organizations/{organization_id}/companies
/v1/organizations/{organization_id}/integrations
/v1/organizations/{organization_id}/webhook_endpoints
/v1/fiscal_documents
/v1/fiscal_documents/{document_id}
/v1/fiscal_documents/{document_id}/timeline
/v1/inbound/fiscal_documents/{document_type}
/v1/organizations/{organization_id}/inbound-scenarios
/v1/organizations/{organization_id}/vendor-material-mappings
/v1/organizations/{organization_id}/fiscal_documents
/v1/organizations/{organization_id}/fiscal_documents/{document_id}/orchestration
/v1/organizations/{organization_id}/fiscal_documents/{document_id}/plan
/v1/organizations/{organization_id}/fiscal_documents/{document_id}/execute
/v1/organizations/{organization_id}/fiscal_documents/{document_id}/steps/{step_id}/advance
/v1/organizations/{organization_id}/billing/statement
/v1/organizations/{organization_id}/billing/statement.pdf
```

Ver `21_fiscal_inbound_orchestrator.md` para o conjunto completo de rotas do orquestrador inbound (itens, override, busca de pedido, rejeição, integrações).

Ver `23_billing_and_messaging.md` para o extrato de consumo (JSON para membro da org ou staff; PDF somente staff da plataforma).

Para usuários de tenant, preferir organização inferida da sessão quando possível, reduzindo risco de IDOR.

## Erros

Formato Problem Details:

```json
{
  "type": "https://errors.example.com/document_service_disabled",
  "title": "Service is not enabled",
  "status": 422,
  "code": "document_service_disabled",
  "detail": "The requested fiscal service is not enabled for this company.",
  "trace_id": "uuid"
}
```

## Paginação

Cursor-based:

- `limit`
- `after`
- `before`

## Concorrência

Usar ETag/`If-Match` ou campo `version` para alterações administrativas.

## Idempotência

Operações de criação e comandos fiscais aceitam `Idempotency-Key`. Armazenar:

- hash do request;
- status;
- response;
- expiração.

Reutilização da chave com payload diferente retorna conflito.

## Versionamento

Versionar APIs e payloads de evento. Depreciação deve possuir prazo e telemetria de uso.
