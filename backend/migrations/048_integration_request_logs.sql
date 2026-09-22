-- Extend request_traces into a tenant-facing integration request log
-- (header/body/response previews, origin/destination, level).

alter table request_traces
    add column if not exists direction varchar(16),
    add column if not exists origin text,
    add column if not exists destination text,
    add column if not exists level varchar(16),
    add column if not exists summary text,
    add column if not exists request_headers_json jsonb not null default '{}'::jsonb,
    add column if not exists response_headers_json jsonb not null default '{}'::jsonb,
    add column if not exists request_body_preview text,
    add column if not exists response_body_preview text,
    add column if not exists request_payload_key text,
    add column if not exists response_payload_key text;

-- Backfill level for existing fiscal inbound rows.
update request_traces
set level = case
        when http_status is null then 'info'
        when http_status >= 500 then 'error'
        when http_status >= 400 then 'warn'
        else 'info'
    end,
    direction = coalesce(direction, 'inbound'),
    origin = coalesce(origin, 'api_client'),
    destination = coalesce(destination, 'inbound_api'),
    summary = coalesce(summary, span_name)
where level is null;

create index if not exists idx_request_traces_org_level_started
    on request_traces (organization_id, level, started_at desc);

create index if not exists idx_request_traces_org_direction_started
    on request_traces (organization_id, direction, started_at desc);
