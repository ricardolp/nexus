-- +migrate Up

-- ============================================================================
-- Governança da consulta de distribuição por NSU: organization_company_nfe_
-- distribution_polls já registra quando/qual NSU foi pedido/resultado, mas
-- faltava o que a própria SEFAZ devolveu (ultNSU/maxNSU/xMotivo) — sem isso
-- não dá pra um admin ver, por exemplo, "faltam 40 documentos pra pôr em
-- dia" (maxNSU - ultNSU) ou o motivo textual de um cStat sem abrir log bruto.
-- ============================================================================

alter table organization_company_nfe_distribution_polls
    add column ult_nsu bigint,
    add column max_nsu bigint,
    add column xmotivo text;

-- +migrate Down

alter table organization_company_nfe_distribution_polls
    drop column if exists ult_nsu,
    drop column if exists max_nsu,
    drop column if exists xmotivo;
