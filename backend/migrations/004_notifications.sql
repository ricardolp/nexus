-- +migrate Up

create table notifications (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    organization_id uuid references organizations(id),
    type varchar(100) not null,
    title text not null,
    body text not null default '',
    data_json jsonb,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create index idx_notifications_user_created
    on notifications (user_id, created_at desc);

create index idx_notifications_user_unread
    on notifications (user_id, created_at desc)
    where read_at is null;

-- +migrate Down

drop table if exists notifications;
