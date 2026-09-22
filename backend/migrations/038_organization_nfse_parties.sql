-- ============================================================================
-- 038_organization_nfse_parties.sql
-- Org-level NFS-e customers (tomadores) + per-company service catalog
-- (CNAE + LC116 item + NBS). Also expose IBGE municipality on companies
-- for SEFIN DPS cLocEmi.
-- ============================================================================

alter table organization_companies
    add column if not exists ibge_municipality_code char(7);

create table if not exists organization_customers (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    cpf char(11),
    cnpj char(14),
    nif text,
    legal_name text not null,
    email text,
    phone text,
    municipal_registration text,
    street text,
    street_type text,
    number text,
    complement text,
    district text,
    municipality_code char(7),
    uf char(2),
    cep char(8),
    foreign_country_code text,
    foreign_cep text,
    foreign_city text,
    foreign_region text,
    status varchar(20) not null default 'active'
        check (status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint organization_customers_one_document check (
        (case when nullif(trim(cpf), '') is not null then 1 else 0 end)
      + (case when nullif(trim(cnpj), '') is not null then 1 else 0 end)
      + (case when nullif(trim(nif), '') is not null then 1 else 0 end)
        = 1
    )
);

create unique index if not exists uq_organization_customers_org_cpf
    on organization_customers (organization_id, cpf)
    where cpf is not null;

create unique index if not exists uq_organization_customers_org_cnpj
    on organization_customers (organization_id, cnpj)
    where cnpj is not null;

create unique index if not exists uq_organization_customers_org_nif
    on organization_customers (organization_id, nif)
    where nif is not null;

create index if not exists idx_organization_customers_org_name
    on organization_customers (organization_id, legal_name);

create index if not exists idx_organization_customers_org_status
    on organization_customers (organization_id, status);

create table if not exists organization_company_nfse_services (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id) on delete cascade,
    cnae_code text not null,
    cnae_description text,
    service_list_item text not null,
    service_description text,
    nbs_code text not null,
    nbs_description text,
    default_iss_aliquot numeric(18,6),
    default_discrimination text,
    is_primary boolean not null default false,
    is_favorite boolean not null default false,
    sort_order int not null default 0,
    status varchar(20) not null default 'active'
        check (status in ('active', 'disabled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_company_id, cnae_code, service_list_item, nbs_code)
);

create index if not exists idx_org_company_nfse_services_company
    on organization_company_nfse_services (organization_company_id, status, sort_order);
