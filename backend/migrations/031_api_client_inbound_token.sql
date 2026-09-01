-- +migrate Up

-- Token de entrada (X-Org-Token) e uso das chaves técnicas usadas pelo SAP
-- para autenticar POSTs na inbound API. O valor em claro só é devolvido na
-- criação/rotação; aqui ficam o hint mascarado e métricas de uso.
alter table organization_api_clients
    add column if not exists token_hint text,
    add column if not exists last_used_at timestamptz,
    add column if not exists request_count bigint not null default 0;

-- +migrate Down

alter table organization_api_clients
    drop column if exists request_count,
    drop column if exists last_used_at,
    drop column if exists token_hint;
