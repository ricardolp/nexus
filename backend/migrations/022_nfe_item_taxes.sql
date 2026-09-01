-- Extração de impostos por item (ICMS/IPI/PIS/COFINS) a partir do XML da NF-e.
-- Uma coluna JSON evita explodir o schema em dezenas de CST/alíquotas; o
-- cabeçalho complementar (parceiros, totais) continua em organization_nfe.metadata_json.

alter table organization_nfe_items
    add column if not exists taxes_json jsonb not null default '{}'::jsonb;
