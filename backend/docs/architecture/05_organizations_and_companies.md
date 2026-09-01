# Organizations, Companies e Serviços

## `organizations`

Tenant contratante.

Campos:

- `id`
- `legal_name`
- `trade_name`
- `slug`
- `tax_identifier`
- `status`
- `timezone`
- `default_locale`
- `data_region`
- `plan_id`
- `created_at`
- `updated_at`

## `organization_companies`

Empresas/CNPJs pertencentes ao tenant.

Campos:

- `id`
- `organization_id`
- `legal_name`
- `trade_name`
- `cnpj`
- `state_registration`
- `municipal_registration`
- `tax_regime`
- `environment`
- `timezone`
- `status`
- `metadata_json`

Unique: `(organization_id, cnpj)`.

## Catálogo de serviços

### `services`

Catálogo global controlado pelo SaaS.

Exemplos:

- `nfe_inbound`
- `nfe_outbound`
- `nfse_inbound`
- `nfse_outbound`
- `cte`
- `mdfe`
- `event_cancellation`
- `document_distribution`

### `organization_company_services`

Ativação por empresa.

Campos:

- `organization_id`
- `organization_company_id`
- `service_id`
- `status`
- `configuration_json`
- `activated_at`
- `deactivated_at`

Unique: `(organization_company_id, service_id)`.

A API deve recusar documento cujo serviço não esteja ativo para a empresa.

## Ambiente

A empresa pode possuir configurações distintas para:

- `production`
- `homologation`

Credenciais e endpoints nunca devem ser compartilhados entre ambientes.

## Certificado digital (A1)

### `organization_company_certificates`

Certificado digital A1 (PKCS#12/.pfx) usado para assinar NF-e/NFS-e antes do envio à SEFAZ. Ao contrário do certificado A3 (token/smartcard), o A1 é um arquivo — por isso ele é importado para o Azure Key Vault (`internal/platform/keyvault`) e nunca fica em disco ou no banco: o Vault passa a ser o único detentor da chave privada.

Campos:

- `id`
- `organization_id`
- `organization_company_id`
- `type` (`A1`)
- `key_vault_certificate_name` — nome do objeto no Key Vault (estável por empresa; cada upload cria uma nova versão)
- `key_vault_certificate_id` — identificador versionado do Key Vault usado para assinatura (nunca exposto pela API)
- `thumbprint`, `subject_cn`, `issuer_cn`, `serial_number`, `not_before`, `not_after` — metadados lidos do certificado para exibição e alerta de expiração
- `status` (`active`, `replaced`, `revoked`, `expired`)
- `uploaded_by_user_id`

Apenas um certificado pode estar `active` por empresa (índice único parcial). Ao enviar um novo certificado, o ativo anterior é marcado `replaced` na mesma transação.

O certificado não é escopado por `environment` — o mesmo A1 emitido para o CNPJ é usado tanto em produção quanto em homologação; só o endpoint da SEFAZ muda.

### Endpoints (control plane)

- `POST /v1/organizations/{organization_id}/companies/{company_id}/certificates` — envia um novo A1 (`certificate_base64` + `password` no corpo). O arquivo é validado localmente (PKCS#12, validade) antes de ir para o Key Vault, e o **CNPJ e a UF do certificado precisam bater com os da empresa** — ambos lidos direto do Subject do certificado (`CN=RAZAO SOCIAL:CNPJ` e `ST=UF`, confirmado contra o formato real de certificados e-CNPJ ICP-Brasil, não um formato assumido — ver `internal/certificate/validate.go`), nunca do que o requisitante informa. Empresa sem UF cadastrada (`organization_companies.uf`) rejeita o upload de cara (`company_uf_missing`) — sem UF não tem como saber qual UF o certificado deveria ter. A senha e os bytes do arquivo nunca são persistidos nem logados.
  - `ParseA1Certificate` usa `pkcs12.DecodeChain` (`software.sslmate.com/src/go-pkcs12`), não `Decode` — algumas ACs (confirmado com um certificado e-CNPJ real da Certisign) exportam o PFX já com a cadeia completa (folha + intermediária + raiz, 3+ "safe bags"), e tanto o `golang.org/x/crypto/pkcs12` quanto o `Decode` simples deste mesmo pacote rejeitam isso com `"expected exactly two safe bags"` — mesmo com a senha certa, o que aparecia pro usuário como "could not decode... check the file and password", uma mensagem enganosa pro problema real. `keyvault.LocalFileCertificateStore.ImportCertificate` tinha o mesmo bug (chamada separada), corrigido junto, preservando a cadeia (`caCerts`) ao reencodar sem senha em vez de descartá-la.
- `GET /v1/organizations/{organization_id}/companies/{company_id}/certificates` — histórico de certificados da empresa.
- `GET /v1/organizations/{organization_id}/companies/{company_id}/certificates/active` — certificado atualmente ativo (usado para alertas de expiração).
- `POST /v1/organizations/{organization_id}/companies/{company_id}/certificates/{certificate_id}/revoke` — desabilita o certificado ativo no Key Vault e marca `revoked`.

Backend: Azure Key Vault (`AZURE_KEY_VAULT_URL`) ou, na ausência dele, o store local cifrado (`CERT_LOCAL_PATH` + `SECRETS_ENCRYPTION_KEY` — ver `keyvault.Resolve`, `docs/architecture/22_nfe_gateway_service.md`). Só sem nenhum dos dois configurado é que esses endpoints respondem `503 certificate_storage_unavailable`.
