# `request_traces`

Índice pesquisável de requisições e etapas de integração (entrada via Tokens / Inbound API e saída SAP CPI, webhooks, handoff nfe-gateway e SEFAZ/SEFIN).

Payload bruto grande permanece no object storage (`request_payload_key` / `response_payload_key` / `storage_object_key`); a tabela guarda:

- metadados HTTP (método, path, status, duração)
- `direction` (`inbound` | `outbound`), `origin`, `destination`
- `level` (`error` | `warn` | `info` | `debug`) e `summary` para o viewer
- headers sanitizados (`request_headers_json` / `response_headers_json`)
- previews truncados de body/response (~16 KiB)

## APIs

- Staff: `GET /v1/request_traces`, `GET /v1/request_traces/{id}`
- Tenant (permission `integration:manage`):  
  `GET /v1/organizations/{organization_id}/integration_logs` (page/limit/total)  
  `GET /v1/organizations/{organization_id}/integration_logs/{id}`
- Interno (nfe-gateway): `POST /internal/v1/integration_logs`

Segredos em headers/query são redigidos antes da persistência (`Authorization`, `X-Org-Token`, assinaturas de webhook, `client_secret`, etc.).
