-- ============================================================================
-- 037_nfse_outbound_relational.sql
-- Persist full SAP outbound NFS-e JSON into relational columns for reporting
-- and SEFIN authorization metadata.
-- ============================================================================

-- Header / RPS / substitution / reforma cabecalho
alter table organization_nfse
    add column if not exists nature_of_operation text,
    add column if not exists special_tax_regime text,
    add column if not exists optante_simples_nacional boolean,
    add column if not exists cultural_incentive boolean,
    add column if not exists emission_date timestamptz,
    add column if not exists work_code text,
    add column if not exists art_code text,
    add column if not exists substituted_nfse_number text,
    add column if not exists substituted_rps_number text,
    add column if not exists substituted_rps_series text,
    add column if not exists substituted_rps_type text,
    add column if not exists recipient_indicator text,
    add column if not exists consumer_final text,
    add column if not exists emission_purpose text,
    add column if not exists federal_tax_percent numeric(18,4),
    add column if not exists state_tax_percent numeric(18,4),
    add column if not exists municipal_tax_percent numeric(18,4);

-- Prestador
alter table organization_nfse
    add column if not exists provider_cnpj char(14),
    add column if not exists provider_im text,
    add column if not exists provider_municipality_code char(7);

-- Tomador
alter table organization_nfse
    add column if not exists taker_cpf char(11),
    add column if not exists taker_cnpj char(14),
    add column if not exists taker_nif text,
    add column if not exists taker_nif_absence_reason text,
    add column if not exists taker_im text,
    add column if not exists taker_legal_name text,
    add column if not exists taker_phone text,
    add column if not exists taker_email text,
    add column if not exists taker_street text,
    add column if not exists taker_street_type text,
    add column if not exists taker_number text,
    add column if not exists taker_complement text,
    add column if not exists taker_district text,
    add column if not exists taker_municipality_code char(7),
    add column if not exists taker_uf char(2),
    add column if not exists taker_cep char(8),
    add column if not exists taker_foreign_country_code text,
    add column if not exists taker_foreign_cep text,
    add column if not exists taker_foreign_city text,
    add column if not exists taker_foreign_region text;

-- Intermediario
alter table organization_nfse
    add column if not exists intermediary_legal_name text,
    add column if not exists intermediary_cpf char(11),
    add column if not exists intermediary_cnpj char(14),
    add column if not exists intermediary_nif text,
    add column if not exists intermediary_nif_absence_reason text,
    add column if not exists intermediary_im text,
    add column if not exists intermediary_municipality_code char(7);

-- Servico / ISS
alter table organization_nfse
    add column if not exists service_amount numeric(18,4),
    add column if not exists deductions_amount numeric(18,4),
    add column if not exists pis_amount numeric(18,4),
    add column if not exists cofins_amount numeric(18,4),
    add column if not exists inss_amount numeric(18,4),
    add column if not exists ir_amount numeric(18,4),
    add column if not exists csll_amount numeric(18,4),
    add column if not exists iss_withheld boolean,
    add column if not exists iss_amount numeric(18,4),
    add column if not exists iss_withheld_amount numeric(18,4),
    add column if not exists other_withholdings numeric(18,4),
    add column if not exists calculation_base numeric(18,4),
    add column if not exists iss_rate numeric(18,6),
    add column if not exists unconditional_discount numeric(18,4),
    add column if not exists conditional_discount numeric(18,4),
    add column if not exists service_list_item text,
    add column if not exists cnae_code text,
    add column if not exists municipal_tax_code text,
    add column if not exists discrimination text,
    add column if not exists service_municipality_code char(7),
    add column if not exists total_taxes_percent numeric(18,4),
    add column if not exists total_taxes_source text;

-- Reforma IBS/CBS / PIS-COFINS / vias publicas
alter table organization_nfse
    add column if not exists nbs_code text,
    add column if not exists operation_indicator_code text,
    add column if not exists ibs_cbs_tax_situation text,
    add column if not exists ibs_cbs_tax_classification text,
    add column if not exists ibs_cbs_calculation_base numeric(18,4),
    add column if not exists ibs_uf_rate numeric(18,6),
    add column if not exists ibs_mun_rate numeric(18,6),
    add column if not exists cbs_rate numeric(18,6),
    add column if not exists ibs_uf_amount numeric(18,4),
    add column if not exists ibs_mun_amount numeric(18,4),
    add column if not exists cbs_amount numeric(18,4),
    add column if not exists incidence_municipality_code char(7),
    add column if not exists pis_cofins_tax_situation text,
    add column if not exists pis_cofins_calculation_base numeric(18,4),
    add column if not exists pis_rate numeric(18,6),
    add column if not exists cofins_rate numeric(18,6),
    add column if not exists pis_cofins_withholding_type text,
    add column if not exists public_roads_flag integer,
    add column if not exists service_street text,
    add column if not exists service_number text,
    add column if not exists service_complement text,
    add column if not exists service_district text,
    add column if not exists service_city_name text,
    add column if not exists service_uf char(2),
    add column if not exists service_cep char(8);

-- Autorizacao SEFIN / Portal Nacional
alter table organization_nfse
    add column if not exists access_key varchar(50),
    add column if not exists dps_id text,
    add column if not exists nfse_number text,
    add column if not exists authorization_status text,
    add column if not exists authorization_code text,
    add column if not exists authorization_message text,
    add column if not exists authorized_at timestamptz;

create index if not exists idx_organization_nfse_provider_cnpj
    on organization_nfse (organization_id, provider_cnpj);

create index if not exists idx_organization_nfse_access_key
    on organization_nfse (organization_id, access_key)
    where access_key is not null;
