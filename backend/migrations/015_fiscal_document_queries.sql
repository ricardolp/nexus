-- +migrate Up

-- ============================================================================
-- Consulta on-demand ao SEFAZ (por NSU, por chave avulsa, ou em lote de
-- chaves), disparada pelo usuário na tela de notas fiscais — distinta do
-- poller automático de distribuição (organization_company_nfe_distribution_*,
-- migração 007). Compartilha a MESMA janela de rate-limit da empresa no
-- nfe-gateway (ver docs/architecture/22_nfe_gateway_service.md), então essas
-- tabelas só guardam o pedido e o progresso — o orçamento de 20/h continua
-- vivendo em organization_company_nfe_distribution_state.
-- ============================================================================

create table fiscal_document_query_requests (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    requested_by_user_id uuid not null references users(id),
    query_type varchar(20) not null check (query_type in ('nsu', 'chave', 'batch')),
    params_json jsonb not null,
    status varchar(20) not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed')),
    result_summary_json jsonb,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index idx_fiscal_document_query_requests_org
    on fiscal_document_query_requests (organization_id, created_at desc);

create index idx_fiscal_document_query_requests_pending
    on fiscal_document_query_requests (organization_company_id)
    where status in ('pending', 'processing');

create table fiscal_document_query_items (
    id uuid primary key,
    query_request_id uuid not null references fiscal_document_query_requests(id) on delete cascade,
    chave varchar(44) not null,
    status varchar(20) not null default 'pending'
        check (status in ('pending', 'found', 'not_found', 'error')),
    document_id uuid references organization_documents(id),
    error_message text,
    resolved_at timestamptz
);

create index idx_fiscal_document_query_items_request
    on fiscal_document_query_items (query_request_id);

-- +migrate Down

drop table if exists fiscal_document_query_items;
drop table if exists fiscal_document_query_requests;
