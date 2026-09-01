-- +migrate Up

create table organization_company_certificates (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    type varchar(10) not null check (type in ('A1')),
    key_vault_certificate_name text not null,
    key_vault_certificate_id text not null,
    thumbprint char(40) not null,
    subject_cn text,
    issuer_cn text,
    serial_number text,
    not_before timestamptz not null,
    not_after timestamptz not null,
    status varchar(20) not null check (status in ('active', 'replaced', 'revoked', 'expired')),
    uploaded_by_user_id uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Only one certificate may be active (used for signing) per company at a time.
create unique index uq_organization_company_certificates_active
    on organization_company_certificates (organization_company_id)
    where status = 'active';

create index idx_organization_company_certificates_company
    on organization_company_certificates (organization_company_id, created_at desc);

-- +migrate Down

drop table if exists organization_company_certificates;
