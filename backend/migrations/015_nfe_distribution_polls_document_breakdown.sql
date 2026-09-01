-- +migrate Up

-- ============================================================================
-- documents_found (já existente) conta quantos docZip a SEFAZ devolveu num
-- lote, mas não diz quantos eram nota completa (procNFe, de fato ingerida)
-- vs. apenas resumo (resNFe/resEvento — sem <infNFe>, o backend rejeita com
-- 422 missing_company, ver internal/inbound/nfe_header_extract.go). Sem essa
-- distinção o log de governança mostrava "5 documentos" de um jeito
-- enganoso: parecia que tinha ingerido 5 notas, quando na real eram 5
-- resumos que o gateway corretamente pulou.
-- ============================================================================

alter table organization_company_nfe_distribution_polls
    add column documents_ingested integer not null default 0,
    add column documents_summary_only integer not null default 0;

-- +migrate Down

alter table organization_company_nfe_distribution_polls
    drop column if exists documents_ingested,
    drop column if exists documents_summary_only;
