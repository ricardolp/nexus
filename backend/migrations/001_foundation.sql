-- +migrate Up
-- Fundação do SaaS de Mensageria Fiscal (Fase 1–3)

create extension if not exists "pgcrypto";

-- ============================================================================
-- Plataforma / Identity
-- ============================================================================

create table users (
    id uuid primary key,
    platform_role varchar(20) not null check (platform_role in ('admin', 'member')),
    email varchar(320) not null,
    email_normalized varchar(320) not null unique,
    email_verified_at timestamptz,
    status varchar(20) not null check (status in ('pending', 'active', 'suspended', 'disabled')),
    password_hash text,
    password_changed_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1
);

create table user_sessions (
    id uuid primary key,
    user_id uuid not null references users(id),
    refresh_token_hash text not null,
    user_agent text,
    ip_address inet,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create index idx_user_sessions_user_id on user_sessions (user_id);

create table authentication_events (
    id uuid primary key,
    user_id uuid references users(id),
    organization_id uuid,
    event_type varchar(80) not null,
    outcome varchar(40) not null,
    ip_address inet,
    user_agent text,
    metadata_json jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default now()
);

-- ============================================================================
-- Organizations / Tenancy
-- ============================================================================

create table organizations (
    id uuid primary key,
    legal_name text not null,
    trade_name text,
    slug text not null unique,
    tax_identifier text,
    status varchar(20) not null check (status in ('active', 'suspended', 'disabled')),
    timezone text not null default 'America/Sao_Paulo',
    default_locale text not null default 'pt-BR',
    data_region text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1
);

create table organization_members (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    user_id uuid not null references users(id),
    status varchar(20) not null check (status in ('invited', 'active', 'suspended', 'removed')),
    joined_at timestamptz,
    suspended_at timestamptz,
    created_by_user_id uuid references users(id),
    created_at timestamptz not null default now(),
    unique (organization_id, user_id)
);

create index idx_organization_members_org on organization_members (organization_id, status);

create table organization_roles (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    name text not null,
    slug text not null,
    description text,
    is_system boolean not null default false,
    is_default boolean not null default false,
    status varchar(20) not null check (status in ('active', 'disabled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, slug)
);

create table organization_permissions (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_role_id uuid not null references organization_roles(id) on delete cascade,
    resource text not null,
    action text not null,
    conditions_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (organization_role_id, resource, action)
);

create table organization_member_roles (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_member_id uuid not null references organization_members(id) on delete cascade,
    organization_role_id uuid not null references organization_roles(id),
    organization_company_id uuid,
    valid_from timestamptz not null default now(),
    valid_until timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_member_id, organization_role_id, organization_company_id)
);

create table organization_companies (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    legal_name text not null,
    trade_name text,
    cnpj char(14) not null,
    state_registration text,
    municipal_registration text,
    tax_regime text,
    environment varchar(20) not null check (environment in ('production', 'homologation')),
    timezone text,
    status varchar(20) not null check (status in ('active', 'suspended', 'disabled')),
    metadata_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1,
    unique (organization_id, cnpj)
);

create index idx_organization_companies_org_status
    on organization_companies (organization_id, status);

alter table organization_member_roles
    add constraint fk_member_roles_company
    foreign key (organization_company_id) references organization_companies(id);

create table services (
    id uuid primary key,
    code text not null unique,
    name text not null,
    description text,
    status varchar(20) not null check (status in ('active', 'disabled')),
    created_at timestamptz not null default now()
);

create table organization_company_services (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    service_id uuid not null references services(id),
    status varchar(20) not null check (status in ('active', 'disabled')),
    configuration_json jsonb not null default '{}'::jsonb,
    activated_at timestamptz,
    deactivated_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_company_id, service_id)
);

-- ============================================================================
-- API clients (credenciais técnicas)
-- ============================================================================

create table organization_api_clients (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    name text not null,
    client_id text not null unique,
    status varchar(20) not null check (status in ('active', 'suspended', 'revoked')),
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table organization_api_client_credentials (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_api_client_id uuid not null references organization_api_clients(id) on delete cascade,
    client_secret_hash text not null,
    secret_hint text,
    status varchar(20) not null check (status in ('active', 'rotated', 'revoked')),
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    revoked_at timestamptz
);

create table organization_api_client_scopes (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_api_client_id uuid not null references organization_api_clients(id) on delete cascade,
    scope text not null,
    created_at timestamptz not null default now(),
    unique (organization_api_client_id, scope)
);

create table organization_api_client_ip_rules (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_api_client_id uuid not null references organization_api_clients(id) on delete cascade,
    cidr text not null,
    rule_type varchar(20) not null check (rule_type in ('allow', 'deny')),
    created_at timestamptz not null default now()
);

-- ============================================================================
-- Integrações e webhooks
-- ============================================================================

create table organization_integrations (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid references organization_companies(id),
    name text not null,
    integration_type varchar(40) not null,
    environment varchar(20) not null check (environment in ('production', 'homologation')),
    base_url text,
    status varchar(20) not null check (status in ('active', 'disabled', 'error')),
    secret_ref text,
    configuration_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table organization_webhook_endpoints (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid references organization_companies(id),
    name text not null,
    url text not null,
    status varchar(20) not null check (status in ('active', 'disabled', 'blocked')),
    secret_ref text not null,
    api_version text not null default 'v1',
    timeout_ms integer not null default 10000,
    max_attempts integer not null default 8,
    failure_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table organization_webhook_subscriptions (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    webhook_endpoint_id uuid not null references organization_webhook_endpoints(id) on delete cascade,
    event_type text not null,
    filters_json jsonb not null default '{}'::jsonb,
    status varchar(20) not null check (status in ('active', 'disabled')),
    created_at timestamptz not null default now(),
    unique (webhook_endpoint_id, event_type)
);

create table webhook_events (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    event_type text not null,
    aggregate_type text not null,
    aggregate_id uuid not null,
    payload_json jsonb not null,
    status varchar(20) not null check (status in ('pending', 'delivering', 'delivered', 'failed', 'dead_letter')),
    created_at timestamptz not null default now()
);

create table webhook_deliveries (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    webhook_event_id uuid not null references webhook_events(id),
    webhook_endpoint_id uuid not null references organization_webhook_endpoints(id),
    attempt_number integer not null,
    request_payload_id uuid,
    response_payload_id uuid,
    http_status integer,
    duration_ms integer,
    outcome varchar(40) not null,
    next_attempt_at timestamptz,
    delivered_at timestamptz,
    error_message_sanitized text,
    created_at timestamptz not null default now()
);

create index idx_webhook_deliveries_pending
    on webhook_deliveries (organization_id, outcome, next_attempt_at);

-- ============================================================================
-- Documentos fiscais
-- ============================================================================

create table organization_documents (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    document_type varchar(20) not null check (document_type in ('nfe', 'nfse')),
    direction varchar(20) not null check (direction in ('inbound', 'outbound')),
    environment varchar(20) not null check (environment in ('production', 'homologation')),
    external_id text,
    source_system text not null,
    source_document_id text,
    idempotency_key text not null,
    document_key text,
    status varchar(40) not null,
    processing_status varchar(40) not null,
    current_version integer not null default 1,
    correlation_id uuid not null,
    trace_id uuid not null,
    received_at timestamptz not null,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1,
    unique (
        organization_id,
        organization_company_id,
        source_system,
        idempotency_key
    )
);

create index idx_organization_documents_status_created_at
    on organization_documents (organization_id, status, created_at desc);

create index idx_organization_documents_processing
    on organization_documents (organization_id, processing_status, updated_at);

create table organization_nfe (
    organization_document_id uuid primary key references organization_documents(id) on delete cascade,
    organization_id uuid not null references organizations(id),
    access_key char(44),
    series text,
    number text,
    model text,
    issuer_cnpj char(14),
    recipient_document text,
    issued_at timestamptz,
    metadata_json jsonb not null default '{}'::jsonb
);

create table organization_nfse (
    organization_document_id uuid primary key references organization_documents(id) on delete cascade,
    organization_id uuid not null references organizations(id),
    municipality_code text,
    provider_code text,
    rps_number text,
    rps_series text,
    verification_code text,
    issued_at timestamptz,
    metadata_json jsonb not null default '{}'::jsonb
);

create table organization_document_payloads (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    payload_type varchar(40) not null,
    content_type text not null,
    storage_object_key text not null,
    sha256 char(64) not null,
    size_bytes bigint not null,
    encryption_key_version text,
    contains_sensitive_data boolean not null default true,
    created_at timestamptz not null default now()
);

create index idx_document_payloads_document
    on organization_document_payloads (organization_id, organization_document_id);

create table organization_document_events (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    event_type text not null,
    from_status varchar(40),
    to_status varchar(40),
    actor_type varchar(40) not null,
    actor_id text,
    correlation_id uuid,
    trace_id uuid,
    metadata_json jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default now()
);

create index idx_document_events_timeline
    on organization_document_events (organization_id, organization_document_id, occurred_at);

create table organization_document_attempts (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    attempt_number integer not null,
    provider text not null,
    operation text not null,
    started_at timestamptz not null,
    finished_at timestamptz,
    outcome varchar(40) not null,
    http_status integer,
    error_code text,
    error_message_sanitized text,
    request_payload_id uuid references organization_document_payloads(id),
    response_payload_id uuid references organization_document_payloads(id),
    created_at timestamptz not null default now(),
    unique (organization_document_id, attempt_number)
);

create table organization_document_errors (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    attempt_id uuid references organization_document_attempts(id),
    error_code text not null,
    error_message_sanitized text not null,
    is_retryable boolean not null default false,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- Mensageria confiável
-- ============================================================================

create table outbox_events (
    id uuid primary key,
    organization_id uuid not null,
    aggregate_type text not null,
    aggregate_id uuid not null,
    event_type text not null,
    payload_json jsonb not null,
    status varchar(20) not null check (status in ('pending', 'publishing', 'published', 'failed')),
    attempt_count integer not null default 0,
    available_at timestamptz not null default now(),
    published_at timestamptz,
    last_error text,
    created_at timestamptz not null default now()
);

create index idx_outbox_events_pending
    on outbox_events (status, available_at)
    where status in ('pending', 'failed');

create table inbox_events (
    id uuid primary key,
    consumer_name text not null,
    event_id uuid not null,
    organization_id uuid,
    result text,
    processed_at timestamptz not null default now(),
    unique (consumer_name, event_id)
);

create table dead_letter_events (
    id uuid primary key,
    organization_id uuid,
    source_event_id uuid,
    event_type text not null,
    payload_json jsonb not null,
    cause text not null,
    stack_sanitized text,
    attempt_count integer not null default 0,
    status varchar(20) not null check (status in ('open', 'requeued', 'discarded')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create table scheduled_jobs (
    id uuid primary key,
    organization_id uuid,
    job_type text not null,
    payload_json jsonb not null default '{}'::jsonb,
    status varchar(20) not null check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
    available_at timestamptz not null default now(),
    locked_at timestamptz,
    locked_by text,
    attempt_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_scheduled_jobs_pending
    on scheduled_jobs (status, available_at)
    where status = 'pending';

-- ============================================================================
-- Idempotência / auditoria / traces
-- ============================================================================

create table idempotency_records (
    id uuid primary key,
    organization_id uuid not null,
    scope text not null,
    idempotency_key text not null,
    request_hash char(64) not null,
    status varchar(20) not null check (status in ('started', 'completed', 'failed')),
    response_status integer,
    response_body jsonb,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (organization_id, scope, idempotency_key)
);

create table request_traces (
    id uuid primary key,
    organization_id uuid,
    correlation_id uuid not null,
    trace_id uuid not null,
    span_name text not null,
    actor_type varchar(40),
    actor_id text,
    http_method text,
    http_path text,
    http_status integer,
    duration_ms integer,
    request_hash char(64),
    storage_object_key text,
    metadata_json jsonb not null default '{}'::jsonb,
    started_at timestamptz not null,
    finished_at timestamptz,
    created_at timestamptz not null default now()
);

create index idx_request_traces_correlation
    on request_traces (correlation_id, started_at desc);

create table audit_events (
    id uuid primary key,
    organization_id uuid,
    actor_type varchar(40) not null,
    actor_id text,
    action text not null,
    resource_type text not null,
    resource_id text,
    reason text,
    before_json jsonb,
    after_json jsonb,
    ip_address inet,
    user_agent text,
    correlation_id uuid,
    occurred_at timestamptz not null default now()
);

create index idx_audit_events_org_occurred
    on audit_events (organization_id, occurred_at desc);

-- Seeds de serviços
insert into services (id, code, name, description, status) values
    (gen_random_uuid(), 'nfe_inbound', 'NF-e Inbound', 'Recebimento de NF-e', 'active'),
    (gen_random_uuid(), 'nfe_outbound', 'NF-e Outbound', 'Emissão de NF-e', 'active'),
    (gen_random_uuid(), 'nfse_inbound', 'NFS-e Inbound', 'Recebimento de NFS-e', 'active'),
    (gen_random_uuid(), 'nfse_outbound', 'NFS-e Outbound', 'Emissão de NFS-e', 'active'),
    (gen_random_uuid(), 'event_cancellation', 'Cancelamento', 'Eventos de cancelamento', 'active');

-- +migrate Down
drop table if exists audit_events;
drop table if exists request_traces;
drop table if exists idempotency_records;
drop table if exists scheduled_jobs;
drop table if exists dead_letter_events;
drop table if exists inbox_events;
drop table if exists outbox_events;
drop table if exists organization_document_errors;
drop table if exists organization_document_attempts;
drop table if exists organization_document_events;
drop table if exists organization_document_payloads;
drop table if exists organization_nfse;
drop table if exists organization_nfe;
drop table if exists organization_documents;
drop table if exists webhook_deliveries;
drop table if exists webhook_events;
drop table if exists organization_webhook_subscriptions;
drop table if exists organization_webhook_endpoints;
drop table if exists organization_integrations;
drop table if exists organization_api_client_ip_rules;
drop table if exists organization_api_client_scopes;
drop table if exists organization_api_client_credentials;
drop table if exists organization_api_clients;
drop table if exists organization_company_services;
drop table if exists services;
drop table if exists organization_member_roles;
drop table if exists organization_companies;
drop table if exists organization_permissions;
drop table if exists organization_roles;
drop table if exists organization_members;
drop table if exists organizations;
drop table if exists authentication_events;
drop table if exists user_sessions;
drop table if exists users;
