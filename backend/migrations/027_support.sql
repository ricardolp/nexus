-- +migrate Up
-- Bounded context de suporte: tickets, mensagens, anexos (object storage),
-- menções a documentos fiscais e timeline. Prefixo support_* para não
-- misturar com organization_documents.

create table support_tickets (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    opened_by_user_id uuid not null references users(id),
    public_number bigint not null,
    subject text not null,
    status varchar(20) not null check (status in ('open', 'in_progress', 'resolved', 'closed')),
    priority varchar(20) not null check (priority in ('low', 'medium', 'high', 'critical')),
    sla_hours integer not null,
    sla_due_at timestamptz not null,
    environment varchar(20) not null check (environment in ('production', 'homologation')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, public_number)
);

create index idx_support_tickets_org_created
    on support_tickets (organization_id, created_at desc);

create index idx_support_tickets_org_opener
    on support_tickets (organization_id, opened_by_user_id, created_at desc);

create index idx_support_tickets_org_status
    on support_tickets (organization_id, status, created_at desc);

create table support_ticket_messages (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    author_user_id uuid not null references users(id),
    body_html text not null,
    body_text text not null,
    created_at timestamptz not null default now()
);

create index idx_support_ticket_messages_ticket
    on support_ticket_messages (organization_id, ticket_id, created_at);

create table support_attachments (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    message_id uuid references support_ticket_messages(id) on delete set null,
    original_filename text not null,
    content_type text not null,
    storage_object_key text not null,
    sha256 char(64) not null,
    size_bytes bigint not null,
    created_by_user_id uuid not null references users(id),
    created_at timestamptz not null default now()
);

create index idx_support_attachments_ticket
    on support_attachments (organization_id, ticket_id);

create table support_ticket_document_links (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    document_number text not null,
    document_type varchar(20) not null check (document_type in ('nfe', 'nfse')),
    fiscal_document_id uuid,
    created_at timestamptz not null default now()
);

create index idx_support_ticket_document_links_ticket
    on support_ticket_document_links (organization_id, ticket_id);

create table support_ticket_events (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    ticket_id uuid not null references support_tickets(id) on delete cascade,
    event_type text not null,
    from_status varchar(20),
    to_status varchar(20),
    actor_user_id uuid references users(id),
    metadata_json jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default now()
);

create index idx_support_ticket_events_ticket
    on support_ticket_events (organization_id, ticket_id, occurred_at);

-- +migrate Down

drop table if exists support_ticket_events;
drop table if exists support_ticket_document_links;
drop table if exists support_attachments;
drop table if exists support_ticket_messages;
drop table if exists support_tickets;
