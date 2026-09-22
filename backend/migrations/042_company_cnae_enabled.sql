-- ============================================================================
-- 042_company_cnae_enabled.sql
-- CNAEs da empresa podem ser desabilitados para nao aparecer na emissao NFS-e.
-- Keep this file free of migrate Down markers: without an Up marker the
-- whole file would run as Up and drop the column after adding it.
-- ============================================================================

alter table organization_company_cnaes
    add column if not exists enabled boolean not null default true;
