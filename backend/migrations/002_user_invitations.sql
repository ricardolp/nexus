-- +migrate Up

alter table users drop constraint if exists users_platform_role_check;
alter table users
    add constraint users_platform_role_check
    check (platform_role in ('admin', 'system', 'support', 'member'));

create table user_invitations (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    organization_id uuid references organizations(id),
    token_hash char(64) not null unique,
    expires_at timestamptz not null,
    invited_by_user_id uuid not null references users(id),
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    check (expires_at > created_at),
    check (not (accepted_at is not null and revoked_at is not null))
);

create unique index uq_user_invitations_pending_user
    on user_invitations (user_id)
    where accepted_at is null and revoked_at is null;

create index idx_user_invitations_expiration
    on user_invitations (expires_at)
    where accepted_at is null and revoked_at is null;

-- +migrate Down

drop table if exists user_invitations;

update users set platform_role = 'admin' where platform_role in ('system', 'support');
alter table users drop constraint if exists users_platform_role_check;
alter table users
    add constraint users_platform_role_check
    check (platform_role in ('admin', 'member'));
