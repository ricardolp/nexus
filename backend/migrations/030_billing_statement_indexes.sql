-- +migrate Up

-- Billing extract aggregates documents and events by organization + period.
create index if not exists idx_organization_documents_org_created
    on organization_documents (organization_id, created_at);

create index if not exists idx_organization_document_events_org_occurred
    on organization_document_events (organization_id, occurred_at);

-- +migrate Down

drop index if exists idx_organization_document_events_org_occurred;
drop index if exists idx_organization_documents_org_created;
