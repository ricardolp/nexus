-- Estrutura inicial, não substitui revisão de migrations.

create table users (
    id uuid primary key,
    platform_role varchar(20) not null check (platform_role in ('admin', 'member')),
    email varchar(320) not null,
    email_normalized varchar(320) not null unique,
    email_verified_at timestamptz,
    status varchar(20) not null,
    password_hash text,
    password_changed_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table organizations (
    id uuid primary key,
    legal_name text not null,
    trade_name text,
    slug text not null unique,
    tax_identifier text,
    status varchar(20) not null,
    timezone text not null default 'America/Sao_Paulo',
    default_locale text not null default 'pt-BR',
    data_region text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table organization_members (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    user_id uuid not null references users(id),
    status varchar(20) not null,
    joined_at timestamptz,
    suspended_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_id, user_id)
);

create table organization_companies (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    legal_name text not null,
    trade_name text,
    cnpj char(14) not null,
    status varchar(20) not null,
    environment varchar(20) not null,
    metadata_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, cnpj)
);

create table organization_documents (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    document_type varchar(20) not null,
    direction varchar(20) not null check (direction in ('inbound', 'outbound')),
    environment varchar(20) not null,
    source_system text not null,
    idempotency_key text not null,
    document_key text,
    status varchar(40) not null,
    processing_status varchar(40) not null,
    correlation_id uuid not null,
    trace_id uuid not null,
    received_at timestamptz not null,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (
        organization_id,
        organization_company_id,
        source_system,
        idempotency_key
    )
);

create index idx_organization_documents_status_created_at
on organization_documents (
    organization_id,
    status,
    created_at desc
);
