-- +migrate Up

-- ============================================================================
-- Janela móvel de 20 consultas/hora exigida pela SEFAZ na distribuição por
-- NSU (NT 2014.002) — sem isso o cStat 656 ("consumo indevido") bloqueia o
-- CNPJ. Colunas adicionadas em vez de recriar a tabela (aplicada em
-- 007_nfe_gateway_distribution.sql). Propriedade do nfe-gateway, mesmo
-- dono das demais colunas desta tabela — ver
-- docs/architecture/22_nfe_gateway_service.md.
-- ============================================================================

alter table organization_company_nfe_distribution_state
    add column window_started_at timestamptz not null default now(),
    add column calls_in_window integer not null default 0;

-- +migrate Down

alter table organization_company_nfe_distribution_state
    drop column if exists calls_in_window,
    drop column if exists window_started_at;
