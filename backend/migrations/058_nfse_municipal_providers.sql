-- 058_nfse_municipal_providers.sql
-- Provedores municipais de NFS-e plugáveis.
-- Ver docs/architecture/25_nfse_provedores_municipais.md.
--
-- nfse_municipal_providers: catálogo global (plataforma) município IBGE → provedor.
--   Sem linha (ou enabled=false) o município segue para a SEFIN Nacional.
-- organization_company_nfse_provider_settings: credencial do webservice municipal
--   por empresa × provedor (senha cifrada AES-256-GCM, SECRETS_ENCRYPTION_KEY),
--   overrides de configuração e force_route (força o provedor para a empresa).
-- organization_nfse.provider_*: provedor congelado na nota no handoff ao gateway
--   + link/PDF oficial devolvido pelo provedor.

create table if not exists nfse_municipal_providers (
    ibge_municipality_code char(7) primary key,
    municipality_name text not null,
    uf char(2) not null,
    provider_code text not null,
    provider_config jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table nfse_municipal_providers is
    'Catálogo global: município (IBGE) → provedor de NFS-e (sefin_nacional, ipm, ...). provider_config não guarda segredo.';

create table if not exists organization_company_nfse_provider_settings (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    provider_code text not null,
    username text,
    secret_ref text,
    config_overrides jsonb not null default '{}'::jsonb,
    force_route boolean not null default false,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_company_id, provider_code)
);

create index if not exists idx_org_company_nfse_provider_settings_org
    on organization_company_nfse_provider_settings (organization_id, organization_company_id);

comment on column organization_company_nfse_provider_settings.secret_ref is
    'Senha do webservice municipal cifrada ("enc:" + AES-256-GCM). Nunca devolvida pela API pública.';
comment on column organization_company_nfse_provider_settings.force_route is
    'true: a empresa emite por este provedor mesmo que o catálogo do município aponte outro.';

alter table organization_nfse
    add column if not exists provider_code text,
    add column if not exists provider_config jsonb,
    add column if not exists provider_pdf_url text,
    add column if not exists provider_pdf_object_key text;

comment on column organization_nfse.provider_code is
    'Provedor usado na emissão (sefin_nacional quando nulo). Cancelamento/consulta usam o mesmo.';

-- Garuva/SC: conveniada ao padrão nacional, mas a emissão via API é pelo
-- Atende.Net (IPM). URL e formato do código de serviço a confirmar com a
-- prefeitura antes de habilitar em produção (ver doc 25).
insert into nfse_municipal_providers (
    ibge_municipality_code, municipality_name, uf, provider_code, provider_config, enabled, notes
) values (
    '4205803', 'Garuva', 'SC', 'ipm',
    '{"base_url": "https://garuva.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao",
      "serie_nfse": "1",
      "item_lista_format": "nacional_6",
      "assinatura": false,
      "enviar_rps": false,
      "ibscbs": true}'::jsonb,
    true,
    'IPM Atende.Net. Portal: https://nfse-garuva.atende.net. Confirmar URL do webservice e exigência de assinatura com a prefeitura.'
) on conflict (ibge_municipality_code) do nothing;
