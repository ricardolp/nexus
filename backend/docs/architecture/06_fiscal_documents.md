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

Para `document_type=nfse`, o body é o JSON aninhado que o sistema de origem (SAP) já monta — `prestador`, `tomador`, `servico` (e opcionalmente `intermediario`). A empresa é resolvida por `prestador.cnpj`; município e RPS vêm de `prestador.codigo_municipio` (fallback `servico.codigo_municipio`) e `numero_rps`/`serie_rps`. Ver `SAPNFSePayload` em [internal/fiscal/sap_outbound_nfse.go](../../internal/fiscal/sap_outbound_nfse.go). Nexus é a mensageria: recebe esse payload, persiste colunas em `organization_nfse` (migration `037`) e transmite ao Portal Nacional (SEFIN) pelo `nfe-gateway` — mesma fila da NF-e, com `document_type=nfse` no CloudEvent.

A UI (JWT) usa o mesmo body em `POST /v1/organizations/{organization_id}/companies/{company_id}/fiscal_documents/nfse` (`source_system=nexus_ui`, permissão `nfse:create`).

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

Download especial (não persistido como payload):

- `danfse` — gera o PDF DANFSe v2.0 (padrão nacional / NT 008) sob demanda a partir do XML autorizado em `sefaz_response`. Disponível só para `document_type=nfse`. Em homologação (`tpAmb=2`) o PDF inclui a marca “NFS-e SEM VALIDADE JURÍDICA”.

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

## NF-e de saída (SAP → colunas → fila)

`POST /v1/fiscal_documents/nfe` recebe o JSON plano do SAP (`YNEX_IF_MSG_NFE`), valida mínimos, persiste colunas em `organization_nfe` / `organization_nfe_items` / tabelas filhas (migrations `034`/`035`) e o payload original no object storage. O `fiscal_worker` com `FISCAL_PROVIDER=messaging` publica `fiscal.document.transmission_requested.v1` (inclui `uf` da empresa e `document_type`). O `nfe-gateway` monta XML (PyNFe), valida estrutura/XSD, assina e autoriza na SEFAZ; o resultado atualiza chave/protocolo/cStat e dispara webhook (`authorized`/`rejected`). Detalhes em [entities/organization_nfe.md](entities/organization_nfe.md) e [22_nfe_gateway_service.md](22_nfe_gateway_service.md).

## NFS-e de saída (SAP/UI → colunas → SEFIN Nacional)

`POST /v1/fiscal_documents/nfse` (OAuth) ou o endpoint JWT da empresa recebe o JSON aninhado, valida mínimos (`serie_rps`/`numero_rps` obrigatórios), persiste em `organization_nfse` (migration `037`) e enfileira o mesmo `fiscal.document.transmission_requested.v1` com `document_type=nfse` e `municipality_code`. O `outbound_consumer` do gateway ramifica para o módulo `nfse/` (DPS → XMLDSig → `POST {sefin}/nfse` com mTLS A1). Outcomes síncronos: `authorized` | `rejected` | `error`. `ApplyTransmissionResult` grava chave/DPS/número em `organization_nfse` (não em `organization_nfe`). Download de artefatos: `GET .../fiscal_documents/{id}/download?payload_type=provider_request|sefaz_response|danfse` (DANFSe gerado on-demand a partir do XML autorizado).

**Cancelamento (101101):** `POST /v1/organizations/{org}/fiscal_documents/{id}/cancel` (JWT, permissão `nfse:cancel`) com `{ "c_motivo": "1"|"2"|"9", "justificativa": "..." }` publica `fiscal.document.cancel_requested.v1`; o `event_consumer` do gateway assina `pedRegEvento`/`e101101` e chama `POST {sefin}/nfse/{chave}/eventos`. Resultado via `fiscal.document.event_result.v1` → status `cancelled`.

**Substituição (correção oficial):** não existe Carta de Correção (CC-e) no Sistema Nacional NFS-e. Correção = emitir nova DPS com grupo `subst` (`chave_nfse_substituida`, `motivo_substituicao`, `justificativa_substituicao`); a SEFIN gera o evento `105102` e cancela a original. Ao autorizar a substituta, o backend marca a original como `cancelled`.

Fora desta onda: ABRASF municipal, ADN por NSU.
