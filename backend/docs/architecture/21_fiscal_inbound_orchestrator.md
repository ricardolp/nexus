# Fiscal Inbound Orchestrator

Motor de orquestração para documentos fiscais de entrada (hoje: NF-e), construído sobre o envelope genérico de `06_fiscal_documents.md` (`organization_documents`/`organization_nfe`) em vez de duplicá-lo. Implementa cenário configurável, matching separado de validação, execution plan com dependência/idempotência/retry, e adapter SAP com stub de fallback — descrito em detalhe abaixo.

## Por que existe

O fluxo de inbound não pode ser uma sequência fixa de código (`se tipo=X então cria pedido, cria delivery, MIGO, MIRO`). Ele precisa ser **dado configurável por cenário**: qual etapa é automática, qual exige um humano, qual tolerância de preço/quantidade, o que fazer quando o pedido não vem no XML ou não existe no SAP. Isso permite que uma organização mude o processo sem alteração de código, e cobre o requisito original de que "cada etapa do SAP pode ficar travada ou automática", incluindo correção manual quando o matching falha (lacuna do sistema legado).

## Documento fiscal canônico

`organization_documents` + `organization_nfe` continuam sendo o dono do cabeçalho/status/idempotência (nenhuma tabela paralela foi criada). O orquestrador adiciona:

- **`organization_nfe_items`** — linhas da NF, nunca sobrescritas pelo matching (visão "original", só `PatchItem` corrige, e reseta para `PENDING`).
- **`organization_document_matches`** — visão "resolução SAP" (o que o SAP/CPI encontrou para vendor/material/pedido/item de pedido).
- **`organization_document_validations`** — resultado das validações configuradas, separado do matching.
- **`organization_document_overrides`** — visão "decisão": toda correção manual, com motivo e usuário, nunca some.
- **`organization_vendor_material_mappings`** — De/Para reutilizável por fornecedor, aprendido a partir de overrides (`save_as_mapping`).
- **`organization_execution_plans`** / **`organization_execution_plan_steps`** — plano de execução versionado, com `step_type`, `mode` (AUTO/MANUAL), `status`, dependência entre steps e `idempotency_key`.

`organization_documents.status` ganhou um vocabulário mais rico para documentos inbound (`RECEIVED, CLASSIFIED, ACTION_REQUIRED, READY_FOR_POSTING, COMPLETED, BLOCKED, REJECTED, FAILED`, ver `internal/fiscal/status.go` vs `internal/inbound/status.go`) — sem migração de schema, pois a coluna já era texto livre.

## Cenário (resolução hierárquica)

`organization_inbound_scenarios` + `organization_inbound_scenario_rules`. A chave de resolução é `empresa + modelo + tipo de pedido + CFOP + fornecedor + centro + organização de compras`, todos nullable = wildcard. `inbound.ResolveScenario` busca todos os cenários ativos da empresa e escolhe o que casa o maior número de campos não-nulos (mais específico ganha; um cenário "default" da empresa, com tudo nulo, serve de fallback). Sem cenário resolvido, o documento vai para `ACTION_REQUIRED` (`fiscal.inbound.scenario_not_found.v1`) — nenhuma chamada SAP é feita.

Cada cenário escolhe um **template de processo** (catálogo fixo em `internal/inbound/templates.go`, não uma tabela — autoria declarativa de fluxo é fase futura):

| Template | Etapas |
|---|---|
| `STANDARD_PURCHASE` | Pedido → Goods Receipt → Supplier Invoice |
| `EWM_PURCHASE` | Pedido → Inbound Delivery → Goods Receipt → Supplier Invoice |
| `DIRECT_GR` | Pedido → Goods Receipt → Supplier Invoice |
| `SERVICE` | Pedido → Service Entry Sheet → Supplier Invoice |
| `FI_ONLY` | Lançamento contábil direto |

A regra do cenário pode desligar/travar qualquer etapa do template (`inbound_delivery_mode`, `goods_receipt_mode`, `supplier_invoice_mode` = `DISABLED\|AUTO\|MANUAL\|CONDITIONAL`; `CONDITIONAL` é tratado como `MANUAL` nesta versão — motor de regra para avaliar a condição é fase futura).

## Matching x Validação (fases separadas)

Matching (`internal/inbound/matching_*.go`) responde "qual objeto SAP corresponde a este dado fiscal" e sempre roda automaticamente e de forma síncrona no recebimento (`Service.IngestInbound`), pois é só leitura/busca — nunca cria nada no SAP:

- **Vendor**: CNPJ do emitente → `sap.Adapter.ResolveVendor`.
- **Material**: 1) De/Para aprendido (`organization_vendor_material_mappings`), 2) resolução SAP (`ResolveMaterial` — código do fornecedor/registro info/EAN, opaco ao orquestrador), 3) material da linha do pedido já casado, senão `NOT_FOUND`.
- **Pedido**: dirigido pela regra (`po_reference_policy`, `po_missing_action`, `po_resolution_mode`, `po_not_found_action`) — referência ausente com política `REQUIRED`/ação `REJECT` nunca chega a consultar o SAP (mesmo comportamento do exemplo §11 da especificação original).

Validação (`internal/inbound/validation.go`) responde "esse relacionamento é permitido pela configuração", com status `PASS\|WARNING\|BLOCKED\|ACTION_REQUIRED\|OVERRIDDEN\|SKIPPED` e tolerância percentual configurável para quantidade/preço. Validação de impostos é **explicitamente não implementada** (sempre `SKIPPED` com mensagem) — a NF-e não tem extração de ICMS/IPI/PIS/COFINS ainda; documentado como gap, não como falso PASS.

## Correção manual (a lacuna do legado)

- `PATCH .../items/{item_id}` corrige o dado extraído (`PatchItem`) quando o XML vinha vazio/errado — nunca toca em matches, reseta o item para `PENDING`.
- `POST .../override` (`ApplyOverride`) registra a decisão manual (vendor/material/pedido/item de pedido/quantidade/preço), sempre com motivo; `save_as_mapping=true` também grava um De/Para reutilizável para a próxima NF do mesmo fornecedor.
- `GET .../purchase-orders/search` expõe a busca interativa de pedidos no SAP para seleção manual.
- `POST .../reprocess` (`Service.Reprocess`) roda de novo o matching/validação (não a extração — os itens já corrigidos continuam os mesmos, só o resultado do matching é refeito) a partir de `ACTION_REQUIRED`, é o passo que efetivamente aplica a correção feita via `PATCH`/`override` e decide se o documento pode seguir para o execution plan.

## Execution Plan

`Service.BuildExecutionPlan`/`RebuildExecutionPlan` monta os steps mutantes do template (a busca/resolução, sendo só leitura, **não** entra no plano — já rodou no matching). Cada step carrega `idempotency_key = "{document_id}:{step_type}:{sequence}"`, dependência sequencial (o próximo só fica `READY`/`AWAITING_MANUAL` quando o anterior chega a `DONE`/`SKIPPED`), e a mesma função (`Service.AdvanceStep`) executa tanto via worker (`cmd/inbound_orchestrator_worker`, steps `READY`+`AUTO`) quanto via `POST .../steps/{step_id}/advance` (usuário) — **o modo só decide quem aciona, nunca a lógica executada**. Falhas de SAP são classificadas (`sap.ClassifyError`) para decidir retry (`SAP_TIMEOUT`/`authentication_failure` são retentáveis; erro de negócio não é) e nunca duplicam o documento SAP em um retry — a chave de idempotência é checada antes de re-chamar.

## SAP Adapter

`internal/integration` (CRUD de `organization_integrations`, já existia como tabela sem código) + `internal/integration/sap` (`Adapter` com os 9 métodos do desenho original: resolver vendor/material, buscar/criar pedido, criar entrada, postar recebimento, criar service entry, postar fatura, postar documento contábil). `sap.Resolve` usa `CPIClient` (REST real, Basic ou OAuth client-credentials) se houver integração `sap_cpi` ativa (empresa, com fallback para o default da organização), senão `StubClient` (determinístico, permite modelar o fluxo fim-a-fim sem SAP real). `client_secret` é cifrado em repouso (`internal/platform/crypto.Encrypt`, AES-256-GCM, chave via `SECRETS_ENCRYPTION_KEY`).

## Fora de escopo nesta rodada

Rule engine/DSL declarativo (§56-57 da especificação original), EWM e Service Entry Sheet reais (modelados no schema/enum, sem chamada SAP — `StubClient` simula sucesso), aprovação multi-nível, score de confiança avançado de matching, dashboards/KPIs, multi-SAP por organização. O schema (`configuration_json`, `step_type` como enum amplo) foi desenhado para acomodar essas evoluções sem quebra.

## Endpoints

Ver `internal/transport/httpapi/inbound_handlers.go` e `handlers.go` (`receiveInboundDocument`). Permissions novas: `nfe_inbound:read`, `nfe_inbound:manage` (ver `03_identity_and_access.md`); integrações reaproveitam `integration:manage`, já existente.
