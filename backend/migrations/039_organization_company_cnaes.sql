-- +migrate Up
create table if not exists organization_company_cnaes (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    organization_company_id uuid not null references organization_companies(id) on delete cascade,
    cnae_code varchar(7) not null,
    cnae_description text,
    is_primary boolean not null default false,
    source text not null default 'manual',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_company_id, cnae_code)
);

create index if not exists idx_organization_company_cnaes_org_company
    on organization_company_cnaes (organization_id, organization_company_id);

-- +migrate Down
drop index if exists idx_organization_company_cnaes_org_company;
drop table if exists organization_company_cnaes;
