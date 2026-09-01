-- +migrate Up

-- ============================================================================
-- Solicitações de Ciência da Operação, disparadas deliberadamente por um
-- usuário (nunca automático — ver docs/architecture/22_nfe_gateway_service.md
-- e a discussão que motivou essa restrição). Propriedade do backend (Go) —
-- só ele escreve aqui; o nfe-gateway (Python) lê/reivindica linhas
-- 'pending' e atualiza o próprio status ao terminar, mesmo padrão já usado
-- em fiscal_document_query_requests (migration 015), mas para um domínio
-- diferente (evento de manifestação, não consulta de distribuição).
-- ============================================================================

create table nfe_manifestation_requests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    pending_document_id uuid not null references nfe_pending_manifestation_documents(id),
    requested_by_user_id uuid not null references users(id),
    status varchar(20) not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed')),
    error_message text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index idx_nfe_manifestation_requests_org
    on nfe_manifestation_requests (organization_id, created_at desc);

create index idx_nfe_manifestation_requests_pending
    on nfe_manifestation_requests (organization_company_id)
    where status in ('pending', 'processing');

grant select, update on nfe_manifestation_requests to nfe_gateway_role;

-- +migrate Down

revoke all privileges on nfe_manifestation_requests from nfe_gateway_role;
drop table if exists nfe_manifestation_requests;
