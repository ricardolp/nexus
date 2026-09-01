-- +migrate Up
alter table user_sessions
    add column if not exists remember_browser boolean not null default false;

create table if not exists user_trusted_devices (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    token_hash text not null unique,
    user_agent text,
    ip_address inet,
    expires_at timestamptz not null,
    last_used_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_user_trusted_devices_user_id
    on user_trusted_devices (user_id);

-- +migrate Down
drop table if exists user_trusted_devices;

alter table user_sessions
    drop column if exists remember_browser;
