-- Organization mark shown in the tenant switcher / organization page header.
-- Distinct from company logos used on DANFE/DANFSe.

-- +migrate Up

alter table organizations
    add column if not exists logo bytea,
    add column if not exists logo_content_type text;

comment on column organizations.logo is
    'PNG or JPEG bytes of the organization mark for the app UI.';
comment on column organizations.logo_content_type is
    'MIME type of organizations.logo (image/png or image/jpeg).';

-- +migrate Down

alter table organizations
    drop column if exists logo_content_type,
    drop column if exists logo;
