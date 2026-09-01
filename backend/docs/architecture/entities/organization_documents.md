# `organization_documents`

Agregado raiz de qualquer documento fiscal.

## Regras

- possui `document_type` e `direction`;
- mantém status de negócio e técnico separados;
- payloads e timeline ficam em tabelas próprias;
- toda criação é idempotente.
