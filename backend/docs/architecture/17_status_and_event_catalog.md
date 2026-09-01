# Status e Eventos

## Status de documento

Manter status de negócio separado do status técnico.

### `status`

- `received`
- `validating`
- `accepted_for_processing`
- `submitted`
- `authorized`
- `rejected`
- `cancel_requested`
- `cancelled`
- `denied`
- `completed`

### `processing_status`

- `pending`
- `queued`
- `processing`
- `waiting_external`
- `retry_scheduled`
- `failed`
- `dead_letter`
- `completed`

## Eventos

Usar passado para eventos ocorridos:

- `fiscal.document.received.v1`
- `fiscal.document.validated.v1`
- `fiscal.document.queued.v1`
- `fiscal.document.transmission_started.v1`
- `fiscal.document.submitted.v1`
- `fiscal.document.authorized.v1`
- `fiscal.document.rejected.v1`
- `fiscal.document.retry_scheduled.v1`
- `fiscal.document.failed.v1`
- `fiscal.document.cancelled.v1`

Comandos internos podem usar intenção:

- `fiscal.document.transmit.v1`
- `fiscal.document.requery.v1`
- `webhook.deliver.v1`

## Vocabulário adicional para inbound

`organization_documents.status` não tem CHECK constraint, então documentos `direction=inbound` processados pelo orquestrador fiscal (`21_fiscal_inbound_orchestrator.md`) usam um vocabulário próprio, mais rico, coexistindo na mesma coluna com o de cima (usado por outbound): `RECEIVED, XML_VALIDATED, CLASSIFIED, MATCHING, VALIDATING, ACTION_REQUIRED, READY_FOR_POSTING, EXECUTING, PO_CREATED, DELIVERY_CREATED, GR_POSTED, INVOICE_POSTED, COMPLETED, BLOCKED, REJECTED, FAILED` (ver `internal/inbound/status.go`). Eventos de nível-documento (`markDocumentStatus`, muda `organization_documents.status`): `fiscal.inbound.scenario_not_found.v1`, `fiscal.inbound.sap_unavailable.v1`, `fiscal.inbound.action_required.v1`, `fiscal.inbound.rejected.v1`, `fiscal.inbound.plan_built.v1`, `fiscal.inbound.completed.v1`. Todos carregam `metadata_json` com contexto (ex.: `reason`, `template_code`, `step_count`, `step` que falhou) — usado pela timeline do frontend para gerar texto descritivo, não só o `event_type` cru.

Eventos de nível-etapa (`insertPlanStepEvent`, não muda o status do documento — só registra na timeline): `fiscal.inbound.step_completed.v1` (`step_type`, `mode`, `sap_document_number`), `fiscal.inbound.step_failed.v1` (`step_type`, `error_code`, `error_message`), `fiscal.inbound.step_skipped.v1` (`step_type`, `reason`) — é como o número de PO/delivery/MIGO/MIRO criado em cada etapa do plano de execução chega na timeline sem o usuário precisar abrir o plano separadamente.

## Compatibilidade

Nunca alterar semanticamente um evento publicado. Criar `.v2` e manter consumidores durante migração.
