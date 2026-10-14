-- 059_nfse_garuva_ws_url.sql
-- Garuva/SC (IPM): URL do webservice conforme o manual da prefeitura
-- (NTE 35/2021 v2.8, §3.1 "https://ws-cidade.atende.net/?pg=rest&service=WNERestServiceNFSe").
-- Só troca a URL semeada na 058; não sobrescreve um valor editado depois.
update nfse_municipal_providers
set provider_config = provider_config || '{"base_url": "https://ws-garuva.atende.net/?pg=rest&service=WNERestServiceNFSe"}'::jsonb,
    notes = 'IPM Atende.Net. Manual da prefeitura: NTE 35/2021 v2.8 + NTE 122/2025 v1.7 (IBS/CBS). Portal: https://nfse-garuva.atende.net.',
    updated_at = now()
where ibge_municipality_code = '4205803'
  and provider_config->>'base_url' = 'https://garuva.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao';
