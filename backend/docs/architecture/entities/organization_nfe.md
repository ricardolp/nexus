# `organization_nfe`

Extensão 1:1 de `organization_documents` para NF-e (entrada e saída).

Além da fronteira clássica (`access_key`, `series`, `number`, `model`, `issuer_cnpj`, `recipient_document`, `issued_at`), a migration `034_nfe_outbound_relational.sql` (e gaps em `035`) amplia a tabela com colunas escalares para:

- identificação (natureza, finalidade, datas, `unique_code` / cNF)
- emitente, destinatário, retirada e entrega (endereços e inscrição)
- totais ICMS legado e reforma (IBS/CBS/IS)
- fatura, transporte, informações adicionais, cana/agro
- autorização SEFAZ (`authorization_protocol`, `authorization_cstat`, `authorization_xmotivo`, `authorized_at`)

Itens e impostos ficam em `organization_nfe_items` (colunas escalares + `taxes_json` legado para inbound). Arrays 1:N (duplicatas, pagamentos, volumes, DI, rastros, etc.) usam tabelas filhas `organization_nfe_*`.

Para saída SAP, o JSON original permanece em object storage (`original_request`); as colunas são a fonte de relatório. O XML assinado/autorizado entra como `provider_request` / `sefaz_response` após o `nfe-gateway`.
