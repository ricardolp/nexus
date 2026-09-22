-- +migrate Up
-- Auto recipient flags on fiscal email templates.

alter table organization_company_email_templates
    add column use_partner_email boolean not null default false,
    add column use_recipient_email boolean not null default false;

-- +migrate Down

alter table organization_company_email_templates
    drop column if exists use_partner_email,
    drop column if exists use_recipient_email;
