-- +migrate Up
-- ============================================================================
-- 049_organization_materials.sql
-- Org-level materials master (Dados Mestres) with SAP-style alternative
-- units of measure, auto-populated from inbound NF-e items via trigger.
-- ============================================================================

create table if not exists organization_materials (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    material_code text not null,
    supplier_material_code text,
    description text,
    base_unit varchar(10),
    ncm varchar(10),
    source varchar(20) not null default 'inbound'
        check (source in ('inbound', 'manual')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, material_code)
);

create index if not exists idx_organization_materials_org_code
    on organization_materials (organization_id, material_code);

create index if not exists idx_organization_materials_org_supplier
    on organization_materials (organization_id, supplier_material_code)
    where supplier_material_code is not null;

-- De/Para of units: X alternative_unit <=> Y base_unit (SAP MM02 UOM tab).
create table if not exists organization_material_uoms (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_material_id uuid not null references organization_materials(id) on delete cascade,
    alternative_unit varchar(10) not null,
    base_unit varchar(10) not null,
    numerator numeric(18,6) not null default 1
        check (numerator > 0),
    denominator numeric(18,6) not null default 1
        check (denominator > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_material_id, alternative_unit)
);

create index if not exists idx_organization_material_uoms_material
    on organization_material_uoms (organization_material_id);

alter table organization_nfe_items
    add column if not exists alternative_unit varchar(10),
    add column if not exists alternative_quantity numeric(18,6);

create or replace function upsert_organization_material_from_nfe_item()
returns trigger
language plpgsql
as $$
declare
    v_code text;
    v_unit text;
    v_material_id uuid;
begin
    v_code := nullif(btrim(coalesce(new.resolved_material_code, new.supplier_material_code, '')), '');
    if v_code is null then
        return new;
    end if;
    v_unit := nullif(upper(btrim(coalesce(new.unit, ''))), '');

    insert into organization_materials (
        id, organization_id, material_code, supplier_material_code, description,
        base_unit, ncm, source, last_seen_at, created_at, updated_at
    ) values (
        gen_random_uuid(),
        new.organization_id,
        v_code,
        nullif(btrim(coalesce(new.supplier_material_code, '')), ''),
        nullif(btrim(coalesce(new.description, '')), ''),
        v_unit,
        nullif(btrim(coalesce(new.ncm, '')), ''),
        'inbound',
        now(),
        now(),
        now()
    )
    on conflict (organization_id, material_code) do update set
        supplier_material_code = coalesce(
            excluded.supplier_material_code,
            organization_materials.supplier_material_code
        ),
        description = coalesce(organization_materials.description, excluded.description),
        base_unit = coalesce(organization_materials.base_unit, excluded.base_unit),
        ncm = coalesce(organization_materials.ncm, excluded.ncm),
        last_seen_at = now(),
        updated_at = now()
    returning id, base_unit into v_material_id, v_unit;

    if v_unit is not null then
        insert into organization_material_uoms (
            id, organization_id, organization_material_id,
            alternative_unit, base_unit, numerator, denominator,
            created_at, updated_at
        ) values (
            gen_random_uuid(), new.organization_id, v_material_id,
            v_unit, v_unit, 1, 1, now(), now()
        )
        on conflict (organization_material_id, alternative_unit) do nothing;
    end if;

    -- When XML unit differs from the material base, seed a 1:1 alternative so
    -- the operator can adjust the factor instead of starting from a blank row.
    if new.unit is not null
       and v_unit is not null
       and upper(btrim(new.unit)) <> v_unit then
        insert into organization_material_uoms (
            id, organization_id, organization_material_id,
            alternative_unit, base_unit, numerator, denominator,
            created_at, updated_at
        ) values (
            gen_random_uuid(), new.organization_id, v_material_id,
            upper(btrim(new.unit)), v_unit, 1, 1, now(), now()
        )
        on conflict (organization_material_id, alternative_unit) do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_nfe_items_upsert_material on organization_nfe_items;
create trigger trg_nfe_items_upsert_material
    after insert or update of supplier_material_code, resolved_material_code, description, unit, ncm
    on organization_nfe_items
    for each row
    execute function upsert_organization_material_from_nfe_item();

insert into organization_materials (
    id, organization_id, material_code, supplier_material_code, description,
    base_unit, ncm, source, last_seen_at, created_at, updated_at
)
select distinct on (
    organization_id,
    coalesce(nullif(btrim(resolved_material_code), ''), nullif(btrim(supplier_material_code), ''))
)
    gen_random_uuid(),
    organization_id,
    coalesce(nullif(btrim(resolved_material_code), ''), btrim(supplier_material_code)),
    nullif(btrim(supplier_material_code), ''),
    nullif(btrim(description), ''),
    nullif(upper(btrim(unit)), ''),
    nullif(btrim(ncm), ''),
    'inbound',
    updated_at,
    created_at,
    updated_at
from organization_nfe_items
where coalesce(nullif(btrim(resolved_material_code), ''), nullif(btrim(supplier_material_code), '')) is not null
order by
    organization_id,
    coalesce(nullif(btrim(resolved_material_code), ''), nullif(btrim(supplier_material_code), '')),
    updated_at desc
on conflict (organization_id, material_code) do nothing;

insert into organization_material_uoms (
    id, organization_id, organization_material_id,
    alternative_unit, base_unit, numerator, denominator, created_at, updated_at
)
select
    gen_random_uuid(),
    m.organization_id,
    m.id,
    m.base_unit,
    m.base_unit,
    1, 1, m.created_at, m.updated_at
from organization_materials m
where m.base_unit is not null
on conflict (organization_material_id, alternative_unit) do nothing;

-- +migrate Down
drop trigger if exists trg_nfe_items_upsert_material on organization_nfe_items;
drop function if exists upsert_organization_material_from_nfe_item();
alter table organization_nfe_items
    drop column if exists alternative_quantity,
    drop column if exists alternative_unit;
drop table if exists organization_material_uoms;
drop table if exists organization_materials;
