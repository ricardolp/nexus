# Documentos Fiscais

## Modelo

Usar uma entidade raiz genérica e extensões por domínio.

### `organization_documents`

Metadados comuns:

- `id`
- `organization_id`
- `organization_company_id`
- `document_type`
- `direction`
- `environment`
- `external_id`
- `source_system`
- `source_document_id`
- `idempotency_key`
- `document_key`
- `status`
- `processing_status`
- `current_version`
- `correlation_id`
- `trace_id`
- `received_at`
- `completed_at`
- `created_at`
- `updated_at`

`source_system` é resolvido a partir da API client credential autenticada (`organization_api_clients.source_system`), não é aceito no corpo de `POST /v1/fiscal_documents/{document_type}` — cada credential representa um único sistema de origem.

O body de `POST /v1/fiscal_documents/{document_type}` não tem envelope: é o próprio payload do documento (o JSON que o sistema de origem já monta), sem `organization_company_id`, `document_key`, `external_id`, `source_document_id`, `content_type` nem bloco `nfe`/`nfse` — não há mais canal para enviar esses campos explicitamente neste endpoint.

Para `document_type=nfe`, `organization_company_id` e `nfe.issuer_cnpj`/`series`/`number` são extraídos do próprio `payload` JSON por nome de campo (`cnpj_emitente`, `serie`, `numero` — schema usado hoje pela integração SAP; ver `extractNFeFromPayload` em [internal/fiscal/nfe_extract.go](../../internal/fiscal/nfe_extract.go)). `organization_company_id` é resolvido contra `organization_companies` pelo CNPJ extraído (escopado pela organização do token); CNPJ sem empresa cadastrada retorna `company_not_found`. Essa extração é por nome de campo, não por `source_system`: se outra integração usar essas mesmas chaves com semântica diferente, ou o payload não for JSON, a extração falha silenciosamente e a requisição é rejeitada por falta de empresa resolvível.

**Gap conhecido:** `document_type=nfse` ainda não tem extração equivalente (não sabemos o schema JSON usado pelas integrações de NFSe). Sem envelope e sem extração, hoje **não há nenhum canal para resolver `organization_company_id` em requisições `nfse`** — toda chamada a `POST /v1/fiscal_documents/nfse` falha com `missing_company`. Só desbloqueia implementando extração análoga para NFSe (precisa do schema real de alguma integração) ou reabrindo algum campo explícito só para esse tipo de documento.

`direction`:

- `inbound`
- `outbound`

`POST /v1/fiscal_documents/{document_type}` só emite documentos e sempre grava `direction=outbound`; não aceita esse campo no body. Documentos `inbound` (recebidos de terceiros) entram por um endpoint dedicado, `POST /v1/inbound/fiscal_documents/{document_type}` (ver [07_inbound_api.md](07_inbound_api.md) e [21_fiscal_inbound_orchestrator.md](21_fiscal_inbound_orchestrator.md)), que também extrai o cabeçalho NF-e do próprio XML (não só do JSON usado pelo SAP) e dispara o pipeline de matching/validação/execution plan do orquestrador.

`document_type`:

- `nfe`
- `nfse`
- futuramente `cte`, `mdfe`, etc.

### Extensões

- `organization_nfe`
- `organization_nfse`

Cada uma contém somente atributos específicos do tipo e FK 1:1 para `organization_documents`.

## Payloads

### `organization_document_payloads`

Cada envio/resposta/versionamento:

- `id`
- `organization_id`
- `organization_document_id`
- `payload_type`
- `content_type`
- `storage_object_key`
- `sha256`
- `size_bytes`
- `encryption_key_version`
- `contains_sensitive_data`
- `created_at`

Tipos:

- `original_request`
- `normalized_request`
- `provider_request`
- `provider_response`
- `sefaz_response`
- `webhook_request`
- `webhook_response`

Não guardar payload fiscal grande em colunas de log.

## Eventos e histórico

### `organization_document_events`

Timeline imutável:

- `id`
- `organization_id`
- `organization_document_id`
- `event_type`
- `from_status`
- `to_status`
- `actor_type`
- `actor_id`
- `correlation_id`
- `trace_id`
- `metadata_json`
- `occurred_at`

### `organization_document_attempts`

Uma tentativa de processamento externo:

- `attempt_number`
- `provider`
- `operation`
- `started_at`
- `finished_at`
- `outcome`
- `http_status`
- `error_code`
- `error_message_sanitized`
- `request_payload_id`
- `response_payload_id`

## Idempotência

Chave única recomendada:

```text
organization_id + organization_company_id + source_system + idempotency_key
```

Para documentos com chave fiscal conhecida, adicionar restrição de negócio coerente com ambiente, tipo e direção.
