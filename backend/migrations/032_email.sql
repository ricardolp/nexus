-- +migrate Up
-- Tenant email: org SMTP credentials, per-company process templates, and
-- immutable mailbox snapshots (sent / not_sent / failed).

create table organization_email_credentials (
    id uuid primary key,
    organization_id uuid not null unique references organizations(id),
    host text not null default '',
    port integer not null default 587,
    username text not null default '',
    password_encrypted text,
    from_name text not null default '',
    from_address text not null default '',
    status varchar(20) not null default 'disabled' check (status in ('active', 'disabled')),
    last_tested_at timestamptz,
    last_test_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table organization_company_email_templates (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id) on delete cascade,
    process_code varchar(60) not null,
    enabled boolean not null default false,
    subject text not null default '',
    to_addresses text[] not null default '{}',
    cc_addresses text[] not null default '{}',
    body_html text not null default '',
    from_name text,
    from_address text,
    attach_xml boolean not null default false,
    attach_danfe_sefaz boolean not null default false,
    attach_danfe_custom boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_company_id, process_code)
);

create index idx_company_email_templates_org_company
    on organization_company_email_templates (organization_id, organization_company_id);

create table organization_email_messages (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    organization_document_id uuid references organization_documents(id) on delete set null,
    template_id uuid references organization_company_email_templates(id) on delete set null,
    process_code varchar(60) not null,
    status varchar(20) not null check (status in ('rendered', 'sent', 'failed', 'not_sent')),
    from_name text not null default '',
    from_address text not null default '',
    to_addresses text[] not null default '{}',
    cc_addresses text[] not null default '{}',
    subject text not null default '',
    body_html text not null default '',
    body_plain text not null default '',
    sent_at timestamptz,
    attempt_count integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_document_id, process_code)
);

create index idx_email_messages_org_created
    on organization_email_messages (organization_id, created_at desc);

create index idx_email_messages_org_company_created
    on organization_email_messages (organization_id, organization_company_id, created_at desc);

create index idx_email_messages_org_status
    on organization_email_messages (organization_id, status, created_at desc);

create table organization_email_message_attachments (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    message_id uuid not null references organization_email_messages(id) on delete cascade,
    kind varchar(30) not null check (kind in ('xml', 'danfe_sefaz', 'danfe_custom')),
    filename text not null default '',
    content_type text not null default '',
    storage_ref text,
    available boolean not null default false,
    created_at timestamptz not null default now()
);

create index idx_email_message_attachments_message
    on organization_email_message_attachments (organization_id, message_id);

-- Backfill email permissions for existing admin roles.
insert into organization_permissions (id, organization_id, organization_role_id, resource, action)
select gen_random_uuid(), r.organization_id, r.id, perm.resource, perm.action
from organization_roles r
cross join (values ('email', 'read'), ('email', 'manage')) as perm(resource, action)
where r.slug = 'administrador' and r.is_system
on conflict (organization_role_id, resource, action) do nothing;

-- +migrate Down

delete from organization_permissions where resource = 'email';

drop table if exists organization_email_message_attachments;
drop table if exists organization_email_messages;
drop table if exists organization_company_email_templates;
drop table if exists organization_email_credentials;
