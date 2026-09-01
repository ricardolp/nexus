# Inbound API

## Endpoint conceitual

```http
POST /v1/fiscal_documents/{document_type}
Authorization: Bearer <access_token>
Idempotency-Key: <uuid>
X-Correlation-Id: <uuid opcional>
Content-Type: application/json
```

`document_type` (`nfe` ou `nfse`) vem da URL, não do body — evita repetir no payload algo que já está na rota. `direction` não é aceito no body: este endpoint é sempre `outbound` (o cliente está pedindo emissão).

Documentos `inbound` (recebidos de terceiros) entram por `POST /v1/inbound/fiscal_documents/{document_type}`, mesma autenticação/idempotência, mas: (1) `direction` é sempre `inbound`; (2) para `nfe`, o cabeçalho (chave de acesso, série, número, modelo, CNPJ emitente/destinatário) é extraído do próprio XML quando `Content-Type` é XML — não só do JSON de campo único usado pela integração SAP outbound — e a empresa é resolvida pelo CNPJ do **destinatário**, não do emitente; (3) a resposta síncrona já reflete o resultado do pipeline de matching/validação do orquestrador (`21_fiscal_inbound_orchestrator.md`), não só o recebimento do envelope.

**O corpo da requisição é o próprio payload do documento, sem envelope** — exatamente o JSON que o sistema de origem já monta (ex.: o JSON de NFe do SAP), byte a byte. Não há mais `organization_company_id`, `document_key`, `external_id`, `source_document_id`, `content_type` nem bloco `nfe`/`nfse` no body:

- `organization_company_id` é resolvido por CNPJ contra `organization_companies` a partir de uma chave conhecida dentro do próprio payload (`cnpj_emitente`, hoje);
- `nfe.series`/`nfe.number`/`nfe.issuer_cnpj` são extraídos do payload por nome de campo (`serie`, `numero`, `cnpj_emitente` — ver [06_fiscal_documents.md](06_fiscal_documents.md));
- `content_type` vem do header HTTP `Content-Type`, não de um campo do body;
- `document_key`, `external_id` e `source_document_id` deixaram de ter um canal de entrada neste endpoint. Se algum consumidor precisar correlacionar com o identificador interno do ERP, hoje só `serie`/`numero` (via extração) ficam disponíveis — não há mais campo livre para IDs arbitrários do lado do cliente.

Resposta:

```json
{
  "document_id": "uuid",
  "trace_id": "uuid",
  "status": "received"
}
```

HTTP `202 Accepted`.

## Credenciais técnicas

Não usar conta humana do SAP.

Entidades:

- `organization_api_clients`
- `organization_api_client_credentials`
- `organization_api_client_scopes`
- `organization_api_client_ip_rules`

Usar OAuth 2.0 client credentials ou JWT client assertion. Para integrações críticas, considerar mTLS.

O token deve conter:

- `sub`
- `organization_id`
- `client_id`
- `source_system`
- `scopes`
- `aud`
- `iss`
- `iat`
- `exp`
- `jti`

Nunca permitir que um client escolha outro tenant no body. Pelo mesmo motivo, `source_system` também não é aceito no body: cada `organization_api_client` é cadastrado com seu `source_system` fixo e o valor é resolvido a partir do token, nunca do payload.

## Pipeline

1. WAF e limite de tamanho.
2. TLS.
3. validação do token.
4. rate limit por client/tenant.
5. resolução da empresa por identificador permitido.
6. validação do serviço ativo.
7. validação de Content-Type e schema.
8. idempotência.
9. persistência do payload no object storage.
10. gravação atômica de documento, evento, trace e outbox.
11. resposta 202.

## Proteções

- limite por payload e tipo;
- streaming para evitar uso excessivo de memória;
- proteção contra XML bombs e XXE;
- validação estrita de JSON/XML;
- timeout curto;
- sem chamadas à SEFAZ na request;
- resposta sem stack trace;
- quotas por organização;
- circuit breaker apenas para dependências inevitáveis.
