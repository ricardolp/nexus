# Integrações SAP e CPI

## Estado implementado

`internal/integration` (CRUD) + `internal/integration/sap` (`Adapter`/`CPIClient`/`StubClient`, ver [21_fiscal_inbound_orchestrator.md](21_fiscal_inbound_orchestrator.md)) implementam uma versão simplificada do design abaixo, usando a tabela `organization_integrations` como já migrada em `001_foundation.sql` — sem as tabelas separadas `organization_integration_credentials`/`organization_integration_headers` descritas nas seções seguintes (ainda não migradas): `secret_ref` guarda o `client_secret` cifrado (AES-256-GCM, `internal/platform/crypto.Encrypt`, chave via `SECRETS_ENCRYPTION_KEY`) diretamente na linha, e `configuration_json` guarda `client_id`/`token_url`/`sap_client`/`sap_language`/headers/capabilities. Rotação de segredo versionada, headers em tabela própria com allowlist e SSRF completo (seções abaixo) permanecem desenho para uma iteração futura caso o volume de integrações justifique a tabela separada.

## Separação (desenho original, parcialmente implementado)

Usar uma entidade de integração e versões de credenciais.

### `organization_integrations`

Campos:

- `id`
- `organization_id`
- `organization_company_id` nullable
- `integration_type`
- `name`
- `environment`
- `status`
- `base_url`
- `authentication_type`
- `timeout_ms`
- `tls_validation_enabled`
- `created_at`
- `updated_at`

`integration_type` pode ser:

- `sap_cpi`
- `sap_s4`
- `sap_ecc`
- `fiscal_provider`
- `custom_http`

### `organization_integration_credentials`

- `organization_integration_id`
- `client_id`
- `client_secret_secret_ref`
- `token_url`
- `certificate_secret_ref`
- `private_key_secret_ref`
- `version`
- `valid_from`
- `expires_at`
- `status`

Segredos ficam no Vault/KMS; o banco armazena referência.

### `organization_integration_headers`

Headers adicionais permitidos:

- `organization_integration_id`
- `header_name`
- `value_secret_ref` ou `value`
- `is_secret`
- `is_enabled`

Exemplo: `sap-language: PT`.

## Segurança de headers

Não aceitar headers arbitrários sem restrição. Bloquear:

- `host`
- `content-length`
- `connection`
- `transfer-encoding`
- `authorization` quando gerenciado pela integração
- headers de proxy
- headers internos do SaaS

## SSRF

Como o tenant configura URL, implementar:

- allowlist por domínio/IP;
- resolução DNS segura;
- bloqueio de loopback, link-local, metadata endpoints e redes privadas não autorizadas;
- revalidação após redirect;
- redirect desabilitado por padrão;
- validação de TLS;
- egress proxy;
- logs de destino.

## Callbacks para SAP

O callback deve preferir OAuth client credentials, mTLS ou ambos. Custom headers podem complementar, nunca substituir autenticação forte.
