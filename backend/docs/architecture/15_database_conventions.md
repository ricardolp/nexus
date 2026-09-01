# Convenções de Banco

## Nomes

- tabelas: plural em `snake_case`;
- colunas: `snake_case`;
- FKs: `<entity>_id`;
- timestamps: `<action>_at`;
- booleanos: `is_`, `has_`, `_enabled`;
- enums no código e constraint no banco;
- arquivos: `snake_case.md`.

## Colunas padrão

Entidades mutáveis:

- `id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`
- `version bigint`

Tenant-owned:

- `organization_id uuid not null`

Soft delete apenas quando necessário:

- `deleted_at timestamptz`
- `deleted_by_user_id uuid`

Preferir status explícito para usuários, integrações e endpoints.

## Integridade

- foreign keys reais;
- `not null` por padrão;
- unique constraints;
- checks;
- IDs gerados no servidor;
- timestamps UTC;
- dinheiro em `numeric`, nunca float;
- JSONB apenas para extensão/configuração, não para esconder modelo central.

## Índices

Todo índice tenant-owned começa normalmente com `organization_id`.

Exemplo:

```sql
create index idx_organization_documents_status_created_at
on organization_documents (
    organization_id,
    status,
    created_at desc
);
```

## CNPJ

Armazenar normalizado com 14 dígitos e validar checksum na aplicação. Manter formatação apenas na apresentação.
