# Multi-tenancy

## Modelo recomendado

Banco e schema compartilhados, com `organization_id` em toda entidade pertencente a tenant.

Entidades pertencentes a uma empresa também devem manter `organization_id`, mesmo possuindo `organization_company_id`. Essa redundância controlada:

- facilita Row Level Security;
- reduz joins de autorização;
- impede referências entre tenants;
- melhora particionamento e auditoria.

## Regras invariáveis

- Toda consulta de tenant contém `organization_id`.
- Toda chave única de negócio inclui `organization_id`.
- Toda foreign key composta valida pertencimento ao mesmo tenant quando possível.
- Nenhum `organization_id` é aceito diretamente do cliente sem comparação com o contexto autenticado.
- Jobs e eventos carregam `organization_id`, mas o consumidor revalida o objeto persistido.
- Cache sempre usa prefixo do tenant.
- Object storage usa prefixo aleatório e não enumerável por tenant.

## Row Level Security

Usar PostgreSQL RLS como camada adicional, não como única camada.

Exemplo conceitual:

```sql
alter table organization_companies enable row level security;

create policy tenant_isolation
on organization_companies
using (
    organization_id = current_setting('app.organization_id')::uuid
);
```

A aplicação deve abrir a transação, definir `app.organization_id` e limpar o contexto ao devolver a conexão ao pool.

## Administração da plataforma

`users.platform_role = 'admin'` permite acessar o control plane, mas não concede implicitamente direitos silenciosos sobre dados fiscais.

Acesso de suporte a tenant deve usar uma sessão explícita de impersonation/support, com:

- motivo obrigatório;
- ticket;
- escopo;
- duração;
- aprovação opcional;
- banner na interface;
- auditoria completa;
- proibição de visualizar segredos em texto puro.

## Estratégia futura

Tenants regulados ou de alto volume podem ser movidos para banco dedicado mantendo a mesma interface de repositório.
