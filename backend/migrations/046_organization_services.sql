-- Contract-level fiscal modules (per organization, not per CNPJ).
-- Product enablement for nfe/nfse inbound/outbound moves here; company-level
-- organization_company_services is kept for future configuration_json (e.g. distribution).

create table if not exists organization_services (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    service_id uuid not null references services(id),
    status varchar(20) not null check (status in ('active', 'disabled')),
    activated_at timestamptz,
    deactivated_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_id, service_id)
);

create index if not exists idx_organization_services_org
    on organization_services (organization_id);

-- Cancelamento leaves the contract catalog (cancel remains RBAC-only).
update services
set status = 'disabled'
where code = 'event_cancellation';

-- Backfill: one row per org × contract service.
-- Active if any CNPJ had it active, or if no company rows exist (default on).
-- Disabled only when company rows exist and none are active.
with contract_codes as (
    select id, code
    from services
    where code in ('nfe_inbound', 'nfe_outbound', 'nfse_inbound', 'nfse_outbound')
),
org_service_state as (
    select
        o.id as organization_id,
        c.id as service_id,
        case
            when bool_or(ocs.status = 'active') then 'active'
            when count(ocs.id) > 0 then 'disabled'
            else 'active'
        end as status
    from organizations o
    cross join contract_codes c
    left join organization_company_services ocs
        on ocs.organization_id = o.id
       and ocs.service_id = c.id
    group by o.id, c.id
)
insert into organization_services (
    id, organization_id, service_id, status, activated_at, deactivated_at, created_at
)
select
    gen_random_uuid(),
    organization_id,
    service_id,
    status,
    case when status = 'active' then now() end,
    case when status = 'disabled' then now() end,
    now()
from org_service_state
on conflict (organization_id, service_id) do nothing;
