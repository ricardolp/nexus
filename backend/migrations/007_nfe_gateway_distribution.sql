-- +migrate Up

-- ============================================================================
-- Estado de distribuição por NSU (consulta SEFAZ) e log de tentativas.
-- Propriedade do nfe-gateway (Python/PyNFe) — o backend só lê, nunca escreve
-- aqui. Ver docs/architecture/22_nfe_gateway_service.md.
-- ============================================================================

create table organization_company_nfe_distribution_state (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    environment varchar(20) not null check (environment in ('production', 'homologation')),
    uf varchar(2) not null,
    last_nsu bigint not null default 0,
    max_nsu bigint not null default 0,
    poll_interval_seconds integer not null default 1200,
    status varchar(20) not null default 'active' check (status in ('active', 'paused', 'error')),
    consecutive_empty_polls integer not null default 0,
    consecutive_errors integer not null default 0,
    last_cstat text,
    last_message text,
    last_poll_at timestamptz,
    last_success_at timestamptz,
    next_allowed_poll_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1,
    unique (organization_company_id, environment)
);

create index idx_nfe_distribution_state_due
    on organization_company_nfe_distribution_state (next_allowed_poll_at)
    where status = 'active';

create index idx_nfe_distribution_state_org
    on organization_company_nfe_distribution_state (organization_id);

create table organization_company_nfe_distribution_polls (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    requested_nsu bigint not null,
    cstat text,
    documents_found integer not null default 0,
    outcome varchar(20) not null check (outcome in ('has_more', 'no_content', 'rate_limited', 'error')),
    error_message text,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index idx_nfe_distribution_polls_company
    on organization_company_nfe_distribution_polls (organization_company_id, created_at desc);

-- ============================================================================
-- Inbox de deduplicação do nfe-gateway (consumo do RabbitMQ é at-least-once),
-- mesmo padrão de inbox_events já documentado em 08_messaging_and_workers.md,
-- só que sem organization_id — os eventos aqui não são todos tenant-scoped
-- (ex.: transmission_requested já carrega organization_id no payload).
-- ============================================================================

create table nfe_gateway_inbox_events (
    consumer_name text not null,
    event_id text not null,
    processed_at timestamptz not null default now(),
    primary key (consumer_name, event_id)
);

-- +migrate Down

drop table if exists nfe_gateway_inbox_events;
drop table if exists organization_company_nfe_distribution_polls;
drop table if exists organization_company_nfe_distribution_state;
