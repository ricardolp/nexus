# Identity, Membership e RBAC

## Separação de papéis

### Papel global da plataforma

Em `users.platform_role`:

- `admin`: administração global da plataforma.
- `system`: identidade operacional interna da plataforma.
- `support`: equipe de suporte.
- `member`: usuário comum; deve possuir ao menos um vínculo ativo em `organization_members`.

O campo global não substitui roles de tenant.

Somente `admin`, `system` e `support` podem convidar usuários. `support` pode
criar apenas usuários `member`; elevação para papéis de plataforma fica
restrita a `admin` e `system`.

Usuários `member` recebem automaticamente a organização do vínculo ativo no
login. Papéis de plataforma podem informar `organization_id` no login para
selecionar explicitamente o contexto de tenant da sessão.

### Papel dentro da organização

Cada organização cria suas próprias roles em `organization_roles`.

Exemplos:

- administrador_fiscal
- operador_entrada
- operador_saida
- auditor
- integrador
- somente_leitura

## Entidades

### `users`

Identidade global.

Campos principais:

- `id`
- `platform_role`
- `email`
- `email_normalized`
- `email_verified_at`
- `status`
- `password_hash`
- `password_changed_at`
- `last_login_at`
- `created_at`
- `updated_at`

### `organization_members`

Vínculo entre usuário e organização.

Campos:

- `id`
- `organization_id`
- `user_id`
- `status`
- `joined_at`
- `suspended_at`
- `created_by_user_id`

Unique: `(organization_id, user_id)`.

### `organization_roles`

Role customizável pelo tenant.

Campos:

- `id`
- `organization_id`
- `name`
- `slug`
- `description`
- `is_system`
- `is_default`
- `status`

Unique: `(organization_id, slug)`.

### `organization_permissions`

Catálogo de permissões habilitadas para uma role.

Campos:

- `id`
- `organization_id`
- `organization_role_id`
- `resource`
- `action`
- `conditions_json`

Unique: `(organization_role_id, resource, action)`.

### `organization_member_roles`

N:N entre member e role.

Campos:

- `organization_id`
- `organization_member_id`
- `organization_role_id`
- `organization_company_id` nullable
- `valid_from`
- `valid_until`

O escopo opcional de empresa permite que um operador tenha acesso apenas a CNPJs específicos.

## Modelo de permissão

Formato:

```text
resource:action
```

Exemplos:

- `organization:read`
- `organization:update`
- `member:invite`
- `member:suspend`
- `role:manage`
- `company:manage`
- `nfe:read`
- `nfe:create`
- `nfe:cancel`
- `nfse:read`
- `nfe_inbound:read`
- `nfe_inbound:manage`
- `integration:manage`
- `webhook:manage`
- `audit:read`
- `document_payload:read_sensitive`

## Autorização

A autorização deve considerar:

1. usuário ativo;
2. organização ativa;
3. membership ativo;
4. role válida;
5. permissão;
6. escopo da empresa;
7. política contextual;
8. classificação do dado.

Negar por padrão.
