-- 060_nfse_garuva_lista_lc116.sql
-- Garuva rejeita o desdobramento nacional (14.01 → 140101) com IPM 00042:
-- o econômico do prestador vincula a atividade ao item LC 116 (1401), não ao
-- cTribNac de 6 dígitos. Só troca o formato semeado; não sobrescreve override
-- de empresa (config_overrides) nem um valor de catálogo já editado.
update nfse_municipal_providers
set provider_config = provider_config || '{"item_lista_format": "lc116"}'::jsonb,
    updated_at = now()
where ibge_municipality_code = '4205803'
  and provider_config->>'item_lista_format' = 'nacional_6';
