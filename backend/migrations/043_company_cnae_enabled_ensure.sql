-- ============================================================================
-- 043_company_cnae_enabled_ensure.sql
-- 042 added enabled then dropped it because a Down section ran as Up.
-- Recreate the column. Keep comments free of migrate markers.
-- ============================================================================

alter table organization_company_cnaes
    add column if not exists enabled boolean not null default true;
