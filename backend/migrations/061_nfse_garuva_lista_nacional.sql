-- 061_nfse_garuva_lista_nacional.sql
-- Garuva/IPM (NTE 122): o item LC 116 de 4 dígitos (14.01 → 1401) devolve
-- 00383 "Lista de Serviço informada não possui desdobramento nacional".
-- O econômico da LS vincula a atividade 331471100 aos códigos 1401 e 140101;
-- o webservice exige o desdobramento de 6 dígitos (140101).
-- O 00042 da 060 era a atividade com 7 dígitos (3314711), não o 140101.
-- Só troca o formato semeado; não sobrescreve override de empresa.
update nfse_municipal_providers
set provider_config = provider_config || '{"item_lista_format": "nacional_6"}'::jsonb,
    updated_at = now()
where ibge_municipality_code = '4205803'
  and provider_config->>'item_lista_format' = 'lc116';
