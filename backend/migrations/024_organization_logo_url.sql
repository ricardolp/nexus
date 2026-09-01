-- +migrate Up

alter table organizations
    add column if not exists logo_url text;

-- +migrate Down

alter table organizations
    drop column if exists logo_url;
