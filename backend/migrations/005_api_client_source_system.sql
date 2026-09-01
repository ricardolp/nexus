-- +migrate Up

alter table organization_api_clients
    add column source_system varchar(120) not null default '';

alter table organization_api_clients
    alter column source_system drop default;

-- +migrate Down

alter table organization_api_clients
    drop column source_system;
