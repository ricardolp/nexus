-- +migrate Up

-- Destinatários notificados quando o fluxo inbound é bloqueado (diferenças
-- fora da tolerância, falha de validação) ou rejeitado.
alter table organization_inbound_scenario_rules
    add column if not exists responsible_emails text[] not null default '{}'::text[];

-- +migrate Down

alter table organization_inbound_scenario_rules
    drop column if exists responsible_emails;
