# Organization customers & company NFS-e service catalog

Supporting entities for the simplified NFS-e emission UX.

## `organization_customers`

Tomadores cadastrados **no nível da organização** (compartilhados entre CNPJs). Migration `038`.

- Exactly one of `cpf` / `cnpj` / `nif`
- Address fields aligned with `organization_nfse.taker_*`
- API: `GET/POST /v1/organizations/{org}/customers`, `GET/PATCH .../customers/{id}` (JWT, `nfse:read` / `nfse:create`)
- `ListCustomers` also merges recent distinct takers from `organization_nfse` (`from_history=true`) when `q` is empty; selecting one persists via `CreateCustomer`

## `organization_company_nfse_services`

Catálogo por empresa: cada linha = CNAE + descrição do serviço. Na emissão, o NBS é sugerido pelo CNAE e o código nacional (LC 116) é filtrado pela correlação oficial NBS × LC 116 (Anexo VIII) ou, sem NBS, pelos itens do CNAE.

API: `GET/POST .../companies/{id}/nfse_services`, `PATCH/DELETE .../nfse_services/{id}` (`nfse:read` / `company:manage`).
`GET .../companies/{id}/nfse/next_rps` sugere série/número RPS a partir da última NFS-e de saída.

## Company IBGE / IM

`organization_companies.municipal_registration` (já existia) e `ibge_municipality_code` (038) são expostos em `UpdateCompanyDetails` / listagem para pré-preencher `prestador` no DPS.

## UI flow

1. `/app/nfse/saida` → Emitir
2. `/app/nfse/saida/nova` — selecionar/criar tomador
3. `/app/nfse/saida/nova/emitir` — empresa + atividade do catálogo + valor → `POST .../fiscal_documents/nfse`
