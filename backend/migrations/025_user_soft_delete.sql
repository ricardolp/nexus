-- +migrate Up
-- Soft delete de usuários: a linha permanece para auditoria e FKs, some das
-- listagens e libera o e-mail para um novo convite.

alter table users
    add column if not exists deleted_at timestamptz,
    add column if not exists deleted_by_user_id uuid references users(id);

alter table users drop constraint if exists users_email_normalized_key;

drop index if exists users_email_normalized_key;

create unique index if not exists users_email_normalized_active_key
    on users (email_normalized)
    where deleted_at is null;

create index if not exists idx_users_deleted_at
    on users (deleted_at)
    where deleted_at is not null;

-- +migrate Down

drop index if exists idx_users_deleted_at;
drop index if exists users_email_normalized_active_key;

create unique index users_email_normalized_key on users (email_normalized);

alter table users
    drop column if exists deleted_by_user_id,
    drop column if exists deleted_at;
