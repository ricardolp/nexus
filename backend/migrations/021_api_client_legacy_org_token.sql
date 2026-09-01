-- +migrate Up

-- Frozen v1 SAP contract: POST /api/v1/nfe/documents/sap authenticates
-- with the static X-Org-Token header used by existing CPI iflows, instead
-- of OAuth client-credentials. The hash lives on the API client so the
-- canonical OAuth secret stays independent and rotatable.
alter table organization_api_clients
    add column legacy_org_token_hash text;

create unique index idx_organization_api_clients_legacy_org_token_hash
    on organization_api_clients (legacy_org_token_hash)
    where legacy_org_token_hash is not null;

-- +migrate Down

drop index if exists idx_organization_api_clients_legacy_org_token_hash;

alter table organization_api_clients
    drop column if exists legacy_org_token_hash;
