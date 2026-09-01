# Cobrança de mensageria

A organização (tenant) paga **por mensagem**. O extrato agrupa o consumo por empresa (CNPJ) e por tipo de evento fiscal, no estilo de um balance statement SAP: emitente Nova Consulting, cliente, período, totais e linhas por produto.

## O que conta como mensagem

| Código | Rótulo | Origem |
|---|---|---|
| `nfe_outbound` | Notas fiscais de saída | `organization_documents` NF-e outbound |
| `nfe_inbound_sefaz` | Notas fiscais de entrada (SEFAZ) | inbound com `source_system` vazio, `nfe_gateway_distribution` ou prefixo `nfe_gateway` |
| `nfe_inbound_xml` | Notas fiscais de entrada (XML manual) | inbound com `source_system = manual_upload` |
| `nfe_inbound_other` | Notas fiscais de entrada (integração) | demais inbounds (oculto quando quantidade = 0) |
| `nfe_cancel` | Cancelamento | eventos de documento (`event_type` contém cancel) |
| `nfe_correction_letter` | Carta de correção | eventos CC-e / carta |
| `nfe_operation_science` | Ciência da operação | eventos de manifestação **e** `nfe_manifestation_requests` (envio real à SEFAZ) |
| `nfe_operation_accept` | Aceite da operação | `confirmacao_da_operacao` |
| `nfe_operation_reject` | Rejeitar operação | `operacao_nao_realizada` |
| `nfse_outbound` / `nfse_inbound` | NFS-e | documentos NFS-e |

Ruído operacional (`received`, `authorized`, etc.) **não** é cobrado. Linhas `AlwaysShow` aparecem mesmo com quantidade 0, para o extrato parecer uma fatura completa.

A ciência pode ser contada duas vezes se o mesmo ato gravar request **e** evento de documento. Requests são o envio SEFAZ; eventos de `RegisterManifestation` são timeline. Vale reconciliar depois se os dois caminhos dispararem juntos.

## Período

`from` e `to` são datas de calendário inclusivas em `America/Sao_Paulo` (`YYYY-MM-DD`). Internamente a consulta usa intervalo UTC meio-aberto `[início, fim)`. Sem parâmetros, o mês corrente. Máximo 366 dias.

## APIs

```text
GET /v1/organizations/{organization_id}/billing/statement?from=&to=
GET /v1/organizations/{organization_id}/billing/statement.pdf?from=&to=
```

- JSON: membro da organização **ou** staff da plataforma (`admin` / `system` / `support`).
- PDF: **somente staff**. O painel do cliente consulta o consumo, mas não imprime nesta versão.

O PDF é emitido em nome da Nova Consulting (produto Nexus). O cabeçalho usa o wordmark oficial da Nova (branco sobre ouro `#f1c149`, de [novaconsulting.com.br](https://novaconsulting.com.br/)) e a marca Nexus; o texto segue o carvão `#36342b` do site. Não há preço unitário: o rodapé remete ao contrato comercial.

## UI

- Admin: `/admin/billing` — seleção de organização, período, extrato e **Imprimir PDF**.
- Tenant: `/app/billing` — organização da sessão, período, sem PDF.
