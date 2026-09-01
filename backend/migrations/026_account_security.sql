-- +migrate Up
-- Perfil do usuário, políticas de autenticação por tenant, MFA TOTP,
-- sessões revogáveis, lockout de login e recuperação de senha.

alter table users
    add column if not exists display_name text,
    add column if not exists phone text,
    add column if not exists bio text,
    add column if not exists timezone text,
    add column if not exists locale text,
    add column if not exists avatar_object_key text,
    add column if not exists appearance_json jsonb not null default '{}'::jsonb,
    add column if not exists notification_preferences_json jsonb not null default '{}'::jsonb;

alter table user_sessions
    add column if not exists jti text,
    add column if not exists device_label text,
    add column if not exists last_seen_at timestamptz not null default now();

create unique index if not exists idx_user_sessions_jti
    on user_sessions (jti)
    where jti is not null;

create table if not exists organization_authentication_settings (
    organization_id uuid primary key references organizations(id),
    min_password_length integer not null default 12 check (min_password_length between 8 and 128),
    max_password_length integer not null default 128 check (max_password_length between 8 and 128),
    require_uppercase boolean not null default false,
    require_lowercase boolean not null default false,
    require_number boolean not null default false,
    require_special boolean not null default false,
    mfa_required boolean not null default false,
    access_locked boolean not null default false,
    access_lock_message text,
    access_locked_at timestamptz,
    access_locked_by_user_id uuid references users(id),
    session_idle_timeout_minutes integer not null default 30 check (session_idle_timeout_minutes between 5 and 10080),
    session_absolute_timeout_minutes integer not null default 480 check (session_absolute_timeout_minutes between 15 and 43200),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint auth_settings_password_bounds check (min_password_length <= max_password_length)
);

insert into organization_authentication_settings (organization_id)
select id from organizations
on conflict (organization_id) do nothing;

create table if not exists user_mfa_methods (
    id uuid primary key,
    user_id uuid not null references users(id),
    method varchar(20) not null check (method in ('totp')),
    secret_encrypted text not null,
    status varchar(20) not null check (status in ('pending', 'active', 'disabled')),
    created_at timestamptz not null default now(),
    confirmed_at timestamptz,
    disabled_at timestamptz,
    unique (user_id, method)
);

create table if not exists user_mfa_recovery_codes (
    id uuid primary key,
    user_id uuid not null references users(id),
    code_hash text not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_user_mfa_recovery_codes_user_id
    on user_mfa_recovery_codes (user_id);

create table if not exists authentication_challenges (
    id uuid primary key,
    user_id uuid not null references users(id),
    organization_id uuid,
    challenge_type varchar(40) not null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    metadata_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_authentication_challenges_user_id
    on authentication_challenges (user_id);

create table if not exists user_login_attempts (
    email_normalized varchar(320) primary key,
    failed_count integer not null default 0,
    window_started_at timestamptz not null default now(),
    locked_until timestamptz
);

create table if not exists password_reset_tokens (
    id uuid primary key,
    user_id uuid not null references users(id),
    token_hash text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_user_id
    on password_reset_tokens (user_id);

-- +migrate Down

drop table if exists password_reset_tokens;
drop table if exists user_login_attempts;
drop table if exists authentication_challenges;
drop table if exists user_mfa_recovery_codes;
drop table if exists user_mfa_methods;
drop table if exists organization_authentication_settings;

drop index if exists idx_user_sessions_jti;

alter table user_sessions
    drop column if exists last_seen_at,
    drop column if exists device_label,
    drop column if exists jti;

alter table users
    drop column if exists notification_preferences_json,
    drop column if exists appearance_json,
    drop column if exists avatar_object_key,
    drop column if exists locale,
    drop column if exists timezone,
    drop column if exists bio,
    drop column if exists phone,
    drop column if exists display_name;
