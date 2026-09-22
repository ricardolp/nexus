-- ============================================================================
-- 035_nfe_outbound_gaps.sql
-- Add missing SAP NF-e header fields not covered in migration 034
-- Fix recipient_uf vs uf_recipient column name mismatch in index
-- ============================================================================

-- Add unique_code (cNF - codigo numerico que compoe a chave de acesso)
-- and change_amount (troco - valor do troco quando pagamento em dinheiro)
-- to organization_nfe header
alter table organization_nfe
    add column if not exists unique_code text,
    add column if not exists change_amount numeric(18,4);

-- Add destination_indicator (idDest - 1=internal operation within same UF, 2=interstate, 3=foreign)
alter table organization_nfe
    add column if not exists destination_indicator char(1);

-- Add intermediary fields (indIntermed + infIntermed)
alter table organization_nfe
    add column if not exists intermediary_cnpj char(14),
    add column if not exists intermediary_id text;

-- Fix column name mismatch: migration 034 created "uf_recipient" but index uses "recipient_uf"
-- The correct column name is "uf_recipient" (created in 034 line 20)
-- So we need to DROP and RECREATE the index with the correct column name

-- Drop the old index that references non-existent "recipient_uf"
drop index if exists idx_nfe_recipient_uf_issued_at;

-- Recreate index using the correct column name "uf_recipient"
create index if not exists idx_nfe_recipient_uf_issued_at
    on organization_nfe (organization_id, uf_recipient, issued_at)
    where uf_recipient is not null;

-- Down migration
-- alter table organization_nfe drop column if exists intermediary_id;
-- alter table organization_nfe drop column if exists intermediary_cnpj;
-- alter table organization_nfe drop column if exists destination_indicator;
-- alter table organization_nfe drop column if exists unique_code;
-- alter table organization_nfe drop column if exists change_amount;
-- drop index if exists idx_nfe_recipient_uf_issued_at;
