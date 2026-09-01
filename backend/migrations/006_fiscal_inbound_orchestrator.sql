-- +migrate Up

-- ============================================================================
-- Cenários de inbound fiscal (resolução hierárquica) e regras associadas
-- ============================================================================

create table organization_inbound_scenarios (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    document_model varchar(20),
    purchase_order_type varchar(20),
    cfop varchar(10),
    vendor_cnpj char(14),
    plant varchar(20),
    purchasing_organization varchar(20),
    process_template_code varchar(40) not null,
    is_active boolean not null default true,
    valid_from timestamptz not null default now(),
    valid_until timestamptz,
    created_by_user_id uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_inbound_scenarios_resolution
    on organization_inbound_scenarios (
        organization_id, organization_company_id, document_model,
        purchase_order_type, cfop, vendor_cnpj, plant
    )
    where is_active;

create table organization_inbound_scenario_rules (
    organization_inbound_scenario_id uuid primary key references organization_inbound_scenarios(id) on delete cascade,
    organization_id uuid not null references organizations(id),

    po_reference_policy varchar(20) not null default 'OPTIONAL'
        check (po_reference_policy in ('REQUIRED', 'OPTIONAL', 'IGNORE')),
    po_reference_level varchar(20) not null default 'DOCUMENT_OR_ITEM'
        check (po_reference_level in ('DOCUMENT', 'ITEM', 'DOCUMENT_OR_ITEM')),
    po_missing_action varchar(30) not null default 'WAIT_USER'
        check (po_missing_action in ('REJECT', 'WAIT_USER', 'SEARCH_SAP', 'CREATE_PO', 'CONTINUE_WITHOUT_PO')),
    po_resolution_mode varchar(30) not null default 'FIND_EXISTING'
        check (po_resolution_mode in ('REQUIRED_EXISTING', 'FIND_EXISTING', 'FIND_OR_CREATE', 'MANUAL_SELECTION', 'CREATE', 'OPTIONAL', 'NONE')),
    po_not_found_action varchar(30) not null default 'WAIT_USER'
        check (po_not_found_action in ('REJECT', 'WAIT_USER', 'CREATE_PO', 'SEARCH_ALTERNATIVE')),

    validate_vendor boolean not null default true,
    vendor_failure_action varchar(20) not null default 'BLOCK'
        check (vendor_failure_action in ('PASS', 'WARN', 'BLOCK', 'WAIT_USER', 'REJECT')),
    vendor_override_allowed boolean not null default false,

    validate_material boolean not null default true,
    material_failure_action varchar(20) not null default 'WAIT_USER'
        check (material_failure_action in ('PASS', 'WARN', 'BLOCK', 'WAIT_USER', 'REJECT')),
    material_override_allowed boolean not null default true,

    validate_quantity boolean not null default true,
    quantity_tolerance_percent numeric(5,2) not null default 0,

    validate_price boolean not null default true,
    price_tolerance_percent numeric(5,2) not null default 0,

    validate_tax boolean not null default false,
    tax_failure_action varchar(20) not null default 'WARN'
        check (tax_failure_action in ('PASS', 'WARN', 'BLOCK', 'WAIT_USER', 'REJECT')),

    receipt_mode varchar(30) not null default 'DIRECT_GOODS_RECEIPT'
        check (receipt_mode in ('INBOUND_DELIVERY', 'DIRECT_GOODS_RECEIPT', 'EWM_INBOUND', 'SERVICE_ENTRY', 'NO_GOODS_RECEIPT', 'MANUAL')),
    inbound_delivery_mode varchar(20) not null default 'DISABLED'
        check (inbound_delivery_mode in ('DISABLED', 'AUTO', 'MANUAL', 'CONDITIONAL')),
    goods_receipt_mode varchar(20) not null default 'MANUAL'
        check (goods_receipt_mode in ('DISABLED', 'AUTO', 'MANUAL', 'CONDITIONAL')),
    goods_receipt_movement_type varchar(10) not null default '101',
    supplier_invoice_mode varchar(20) not null default 'MANUAL'
        check (supplier_invoice_mode in ('DISABLED', 'AUTO', 'MANUAL', 'CONDITIONAL')),

    notify_on_reject boolean not null default true,
    create_occurrence_on_reject boolean not null default true,
    notify_vendor_on_reject boolean not null default false,
    sefaz_event_on_reject boolean not null default false,

    configuration_json jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- Itens da NF-e (canônicos, nunca sobrescrevem o XML original)
-- ============================================================================

create table organization_nfe_items (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    item_number integer not null,
    supplier_material_code text,
    description text,
    ncm varchar(10),
    cfop varchar(10),
    quantity numeric(18,4) not null default 0,
    unit varchar(10),
    unit_price numeric(18,4) not null default 0,
    total_amount numeric(18,4) not null default 0,
    purchase_order_reference_raw text,
    purchase_order_item_reference_raw text,
    resolved_material_code text,
    resolved_purchase_order_number text,
    resolved_purchase_order_item text,
    status varchar(20) not null default 'PENDING'
        check (status in ('PENDING', 'MATCHED', 'NEEDS_CORRECTION', 'BLOCKED', 'SKIPPED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_document_id, item_number)
);

create index idx_nfe_items_document
    on organization_nfe_items (organization_id, organization_document_id);

-- ============================================================================
-- Matching, validação e overrides (visões separadas: original / SAP / decisão)
-- ============================================================================

create table organization_document_matches (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid references organization_nfe_items(id) on delete cascade,
    match_type varchar(30) not null
        check (match_type in ('VENDOR', 'MATERIAL', 'PURCHASE_ORDER', 'PURCHASE_ORDER_ITEM')),
    source_value text,
    resolved_value text,
    strategy varchar(40),
    confidence numeric(4,3),
    status varchar(20) not null
        check (status in ('MATCHED', 'NOT_FOUND', 'MULTIPLE_MATCH', 'MANUAL_MAPPING', 'BLOCKED', 'INACTIVE')),
    created_at timestamptz not null default now()
);

create index idx_document_matches_document
    on organization_document_matches (organization_id, organization_document_id);

create table organization_document_validations (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid references organization_nfe_items(id) on delete cascade,
    validation_type varchar(30) not null
        check (validation_type in ('VENDOR', 'MATERIAL', 'QUANTITY', 'PRICE', 'TAX', 'PO_REFERENCE')),
    status varchar(20) not null
        check (status in ('PASS', 'WARNING', 'BLOCKED', 'ACTION_REQUIRED', 'OVERRIDDEN', 'SKIPPED')),
    severity varchar(10) not null default 'info'
        check (severity in ('info', 'warning', 'error')),
    expected_value text,
    actual_value text,
    message text,
    organization_inbound_scenario_id uuid references organization_inbound_scenarios(id),
    created_at timestamptz not null default now()
);

create index idx_document_validations_document
    on organization_document_validations (organization_id, organization_document_id);

create table organization_document_overrides (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid references organization_nfe_items(id) on delete cascade,
    override_type varchar(30) not null
        check (override_type in ('VENDOR', 'MATERIAL', 'PURCHASE_ORDER', 'PURCHASE_ORDER_ITEM', 'QUANTITY', 'PRICE')),
    original_value text,
    override_value text not null,
    reason text not null,
    created_by_user_id uuid not null references users(id),
    approved_by_user_id uuid references users(id),
    created_at timestamptz not null default now()
);

create index idx_document_overrides_document
    on organization_document_overrides (organization_id, organization_document_id);

-- De/Para de material reutilizável por fornecedor (aprendido a partir de overrides)
create table organization_vendor_material_mappings (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid references organization_companies(id),
    vendor_cnpj char(14) not null,
    supplier_material_code text not null,
    resolved_material_code text not null,
    created_by_user_id uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, organization_company_id, vendor_cnpj, supplier_material_code)
);

-- ============================================================================
-- Execution plan (steps com dependência, idempotência e retry)
-- ============================================================================

create table organization_execution_plans (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    version integer not null default 1,
    status varchar(20) not null default 'DRAFT'
        check (status in ('DRAFT', 'READY', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_document_id, version)
);

create table organization_execution_plan_steps (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_execution_plan_id uuid not null references organization_execution_plans(id) on delete cascade,
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    sequence integer not null,
    step_type varchar(40) not null
        check (step_type in (
            'RESOLVE_VENDOR', 'RESOLVE_MATERIAL', 'SEARCH_PURCHASE_ORDER', 'CREATE_PURCHASE_ORDER',
            'CREATE_INBOUND_DELIVERY', 'POST_GOODS_RECEIPT', 'CREATE_SERVICE_ENTRY',
            'POST_SUPPLIER_INVOICE', 'POST_ACCOUNTING_DOCUMENT'
        )),
    mode varchar(10) not null check (mode in ('AUTO', 'MANUAL')),
    status varchar(20) not null default 'PENDING'
        check (status in ('PENDING', 'READY', 'AWAITING_MANUAL', 'ACTION_REQUIRED', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED', 'BLOCKED')),
    dependency_step_id uuid references organization_execution_plan_steps(id),
    idempotency_key text not null,
    request_payload_json jsonb not null default '{}'::jsonb,
    response_payload_json jsonb not null default '{}'::jsonb,
    sap_document_number text,
    error_code text,
    error_message_sanitized text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_document_id, idempotency_key)
);

create index idx_execution_plan_steps_ready
    on organization_execution_plan_steps (organization_id, status, mode);

create index idx_execution_plan_steps_plan
    on organization_execution_plan_steps (organization_execution_plan_id, sequence);

-- ============================================================================
-- Permissions novas: backfill para organizações já existentes (organizações
-- criadas depois já ganham essas permissions via organization.CreateOrganization)
-- ============================================================================

insert into organization_permissions (id, organization_id, organization_role_id, resource, action)
select gen_random_uuid(), r.organization_id, r.id, perm.resource, perm.action
from organization_roles r
cross join (values ('nfe_inbound', 'read'), ('nfe_inbound', 'manage')) as perm(resource, action)
where r.slug = 'administrador' and r.is_system
on conflict (organization_role_id, resource, action) do nothing;

-- +migrate Down

drop table if exists organization_execution_plan_steps;
drop table if exists organization_execution_plans;
drop table if exists organization_vendor_material_mappings;
drop table if exists organization_document_overrides;
drop table if exists organization_document_validations;
drop table if exists organization_document_matches;
drop table if exists organization_nfe_items;
drop table if exists organization_inbound_scenario_rules;
drop table if exists organization_inbound_scenarios;

delete from organization_permissions where resource = 'nfe_inbound';
