-- ============================================================================
-- 034_nfe_outbound_relational.sql
-- Persist full SAP outbound NF-e JSON into relational columns for reporting
-- ============================================================================

-- ============================================================================
-- ALTER organization_nfe: add ALL header scalars from NF-e structure
-- ============================================================================

-- IDE (identification) fields
alter table organization_nfe
    add column if not exists nature_of_operation text,
    add column if not exists operation_type char(1),
    add column if not exists payment_method char(1),
    add column if not exists finality char(1),
    add column if not exists consumer_final char(1),
    add column if not exists presence_indicator char(1),
    add column if not exists intermediary_indicator char(1),
    add column if not exists uf_issuer char(2),
    add column if not exists uf_recipient char(2),
    add column if not exists municipality_code_issuer char(7),
    add column if not exists municipality_code_recipient char(7),
    add column if not exists print_format char(1),
    add column if not exists emission_type char(1),
    add column if not exists digval char(1),
    add column if not exists emission_date date,
    add column if not exists entry_exit_date timestamptz,
    add column if not exists entry_exit_time time;

-- Issuer details (emit) - complement existing issuer_cnpj
alter table organization_nfe
    add column if not exists issuer_legal_name text,
    add column if not exists issuer_trade_name text,
    add column if not exists issuer_ie text,
    add column if not exists issuer_iest text,
    add column if not exists issuer_im text,
    add column if not exists issuer_cnae text,
    add column if not exists issuer_crt char(1),
    add column if not exists issuer_email text,
    add column if not exists issuer_street text,
    add column if not exists issuer_number text,
    add column if not exists issuer_complement text,
    add column if not exists issuer_district text,
    add column if not exists issuer_city_code char(7),
    add column if not exists issuer_city text,
    add column if not exists issuer_uf char(2),
    add column if not exists issuer_cep char(8),
    add column if not exists issuer_country_code char(4),
    add column if not exists issuer_country text,
    add column if not exists issuer_phone text;

-- Recipient details (dest) - complement existing recipient_document
alter table organization_nfe
    add column if not exists recipient_legal_name text,
    add column if not exists recipient_trade_name text,
    add column if not exists recipient_ie text,
    add column if not exists recipient_isuf text,
    add column if not exists recipient_im text,
    add column if not exists recipient_email text,
    add column if not exists recipient_street text,
    add column if not exists recipient_number text,
    add column if not exists recipient_complement text,
    add column if not exists recipient_district text,
    add column if not exists recipient_city_code char(7),
    add column if not exists recipient_city text,
    add column if not exists recipient_cep char(8),
    add column if not exists recipient_country_code char(4),
    add column if not exists recipient_country text,
    add column if not exists recipient_phone text;

-- Pickup location (retirada)
alter table organization_nfe
    add column if not exists pickup_cnpj char(14),
    add column if not exists pickup_cpf char(11),
    add column if not exists pickup_legal_name text,
    add column if not exists pickup_street text,
    add column if not exists pickup_number text,
    add column if not exists pickup_complement text,
    add column if not exists pickup_district text,
    add column if not exists pickup_city_code char(7),
    add column if not exists pickup_city text,
    add column if not exists pickup_uf char(2),
    add column if not exists pickup_cep char(8),
    add column if not exists pickup_country_code char(4),
    add column if not exists pickup_phone text,
    add column if not exists pickup_email text,
    add column if not exists pickup_ie text;

-- Delivery location (entrega)
alter table organization_nfe
    add column if not exists delivery_cnpj char(14),
    add column if not exists delivery_cpf char(11),
    add column if not exists delivery_legal_name text,
    add column if not exists delivery_street text,
    add column if not exists delivery_number text,
    add column if not exists delivery_complement text,
    add column if not exists delivery_district text,
    add column if not exists delivery_city_code char(7),
    add column if not exists delivery_city text,
    add column if not exists delivery_uf char(2),
    add column if not exists delivery_cep char(8),
    add column if not exists delivery_country_code char(4),
    add column if not exists delivery_phone text,
    add column if not exists delivery_email text,
    add column if not exists delivery_ie text;

-- Totals (ICMSTot)
alter table organization_nfe
    add column if not exists total_icms_base numeric(18,4),
    add column if not exists total_icms numeric(18,4),
    add column if not exists total_icms_deson numeric(18,4),
    add column if not exists total_fcp_uf_dest numeric(18,4),
    add column if not exists total_icms_uf_dest numeric(18,4),
    add column if not exists total_icms_uf_remet numeric(18,4),
    add column if not exists total_fcp numeric(18,4),
    add column if not exists total_icms_st_base numeric(18,4),
    add column if not exists total_icms_st numeric(18,4),
    add column if not exists total_fcp_st numeric(18,4),
    add column if not exists total_fcp_st_ret numeric(18,4),
    add column if not exists total_products numeric(18,4),
    add column if not exists total_freight numeric(18,4),
    add column if not exists total_insurance numeric(18,4),
    add column if not exists total_discount numeric(18,4),
    add column if not exists total_ii numeric(18,4),
    add column if not exists total_ipi numeric(18,4),
    add column if not exists total_ipi_devol numeric(18,4),
    add column if not exists total_pis numeric(18,4),
    add column if not exists total_cofins numeric(18,4),
    add column if not exists total_other numeric(18,4),
    add column if not exists total_nf numeric(18,4),
    add column if not exists total_approx_taxes numeric(18,4);

-- New tax reform totals (IBS/CBS/IS) - NF-e 4.0+
alter table organization_nfe
    add column if not exists total_ibs numeric(18,4),
    add column if not exists total_cbs numeric(18,4),
    add column if not exists total_is numeric(18,4),
    add column if not exists total_ibs_base numeric(18,4),
    add column if not exists total_cbs_base numeric(18,4),
    add column if not exists total_is_base numeric(18,4);

-- Invoice/billing header (cobr)
alter table organization_nfe
    add column if not exists invoice_number text,
    add column if not exists invoice_original_value numeric(18,4),
    add column if not exists invoice_discount_value numeric(18,4),
    add column if not exists invoice_net_value numeric(18,4);

-- Transport header (transp)
alter table organization_nfe
    add column if not exists transport_modality char(1),
    add column if not exists carrier_cnpj char(14),
    add column if not exists carrier_cpf char(11),
    add column if not exists carrier_legal_name text,
    add column if not exists carrier_ie text,
    add column if not exists carrier_street text,
    add column if not exists carrier_city text,
    add column if not exists carrier_uf char(2),
    add column if not exists freight_responsibility char(1),
    add column if not exists vehicle_plate text,
    add column if not exists vehicle_uf char(2),
    add column if not exists vehicle_rntc text,
    add column if not exists volumes_quantity numeric(18,4),
    add column if not exists volumes_species text,
    add column if not exists volumes_brand text,
    add column if not exists volumes_numbering text,
    add column if not exists volumes_gross_weight numeric(18,4),
    add column if not exists volumes_net_weight numeric(18,4);

-- Additional info (infAdic)
alter table organization_nfe
    add column if not exists additional_info_fisco text,
    add column if not exists additional_info_taxpayer text;

-- Export info (exporta)
alter table organization_nfe
    add column if not exists export_uf_exit char(2),
    add column if not exists export_exit_location text,
    add column if not exists export_registration_date date;

-- Purchase info (compra)
alter table organization_nfe
    add column if not exists purchase_note text,
    add column if not exists purchase_order text,
    add column if not exists purchase_contract text;

-- Sugarcane/agro header (cana/agro)
alter table organization_nfe
    add column if not exists sugarcane_crop text,
    add column if not exists sugarcane_ref_month char(2),
    add column if not exists sugarcane_ref_year char(4),
    add column if not exists sugarcane_quantity numeric(18,4),
    add column if not exists sugarcane_atrs numeric(18,4),
    add column if not exists sugarcane_unit_value numeric(18,10),
    add column if not exists sugarcane_total_value numeric(18,4);

-- SEFAZ authorization fields (protNFe/infProt)
alter table organization_nfe
    add column if not exists authorization_protocol text,
    add column if not exists authorization_cstat text,
    add column if not exists authorization_xmotivo text,
    add column if not exists authorization_uf char(2),
    add column if not exists authorized_at timestamptz,
    add column if not exists authorization_digest_value text;

-- Social security contribution withholding (prev_social) 
alter table organization_nfe
    add column if not exists prev_social_inss_base numeric(18,4),
    add column if not exists prev_social_inss_value numeric(18,4),
    add column if not exists prev_social_irrf_base numeric(18,4),
    add column if not exists prev_social_irrf_value numeric(18,4),
    add column if not exists prev_social_csll_base numeric(18,4),
    add column if not exists prev_social_csll_value numeric(18,4),
    add column if not exists prev_social_pis_pasep_base numeric(18,4),
    add column if not exists prev_social_pis_pasep_value numeric(18,4),
    add column if not exists prev_social_cofins_base numeric(18,4),
    add column if not exists prev_social_cofins_value numeric(18,4),
    add column if not exists prev_social_valor_retido numeric(18,4);

-- ============================================================================
-- ALTER organization_nfe_items: add ALL item scalars from NF-e structure
-- (existing: supplier_material_code=codigo_produto, ncm=codigo_ncm, 
--  quantity=quantidade_comercial, unit, unit_price, total_amount, cfop)
-- ============================================================================

-- Product commercial fields (prod)
alter table organization_nfe_items
    add column if not exists product_ean char(14),
    add column if not exists product_extipi char(3),
    add column if not exists product_cest char(7),
    add column if not exists product_ind_escala char(1),
    add column if not exists product_cnpj_fabricante char(14),
    add column if not exists product_cod_beneficio text,
    add column if not exists product_gtin text,
    add column if not exists product_fci_number char(36);

-- Taxable quantities (may differ from commercial)
alter table organization_nfe_items
    add column if not exists taxable_quantity numeric(18,4),
    add column if not exists taxable_unit text,
    add column if not exists taxable_unit_price numeric(18,10);

-- Additional product values
alter table organization_nfe_items
    add column if not exists freight_value numeric(18,4),
    add column if not exists insurance_value numeric(18,4),
    add column if not exists discount_value numeric(18,4),
    add column if not exists other_value numeric(18,4);

-- Product indicators
alter table organization_nfe_items
    add column if not exists ind_total char(1),
    add column if not exists nve text;

-- Vehicle-specific fields (veicProd)
alter table organization_nfe_items
    add column if not exists vehicle_type char(2),
    add column if not exists vehicle_vin text,
    add column if not exists vehicle_condition char(1),
    add column if not exists vehicle_chassis text,
    add column if not exists vehicle_color text,
    add column if not exists vehicle_color_denatran text,
    add column if not exists vehicle_engine_power text,
    add column if not exists vehicle_cylinder_capacity text,
    add column if not exists vehicle_net_weight text,
    add column if not exists vehicle_gross_weight text,
    add column if not exists vehicle_serial text,
    add column if not exists vehicle_fuel_type char(2),
    add column if not exists vehicle_engine_number text,
    add column if not exists vehicle_cmt text,
    add column if not exists vehicle_distance_between_axles text,
    add column if not exists vehicle_model_year char(4),
    add column if not exists vehicle_production_year char(4),
    add column if not exists vehicle_paint_type char(1),
    add column if not exists vehicle_restrictions char(1),
    add column if not exists vehicle_species char(1),
    add column if not exists vehicle_body_type text,
    add column if not exists vehicle_max_traction_capacity text,
    add column if not exists vehicle_cisp text;

-- Medicine-specific fields (med)
alter table organization_nfe_items
    add column if not exists medicine_anvisa_code text,
    add column if not exists medicine_price_max numeric(18,4),
    add column if not exists medicine_unit_price_pmc numeric(18,4);

-- Fuel-specific fields (comb)
alter table organization_nfe_items
    add column if not exists fuel_anp_code char(9),
    add column if not exists fuel_anp_description text,
    add column if not exists fuel_codif text,
    add column if not exists fuel_pglp_percentage numeric(18,4),
    add column if not exists fuel_pgnn_percentage numeric(18,4),
    add column if not exists fuel_pgni_percentage numeric(18,4),
    add column if not exists fuel_startval numeric(18,4),
    add column if not exists fuel_uf_consumption char(2);

-- ICMS (main fields from CST variations)
alter table organization_nfe_items
    add column if not exists icms_origin char(1),
    add column if not exists icms_cst char(2),
    add column if not exists icms_csosn char(4),
    add column if not exists icms_modality char(1),
    add column if not exists icms_base numeric(18,4),
    add column if not exists icms_rate numeric(18,10),
    add column if not exists icms_value numeric(18,4),
    add column if not exists icms_fcp_rate numeric(18,10),
    add column if not exists icms_fcp_value numeric(18,4),
    add column if not exists icms_reduction_rate numeric(18,10),
    add column if not exists icms_deson_reason char(1),
    add column if not exists icms_deson_value numeric(18,4),
    add column if not exists icms_exempt_reason text;

-- ICMS ST (substitution)
alter table organization_nfe_items
    add column if not exists icms_st_modality char(1),
    add column if not exists icms_st_mva_rate numeric(18,10),
    add column if not exists icms_st_reduction_rate numeric(18,10),
    add column if not exists icms_st_base numeric(18,4),
    add column if not exists icms_st_rate numeric(18,10),
    add column if not exists icms_st_value numeric(18,4),
    add column if not exists icms_st_fcp_rate numeric(18,10),
    add column if not exists icms_st_fcp_value numeric(18,4),
    add column if not exists icms_st_fcp_ret_base numeric(18,4),
    add column if not exists icms_st_fcp_ret_rate numeric(18,10),
    add column if not exists icms_st_fcp_ret_value numeric(18,4),
    add column if not exists icms_st_base_retained numeric(18,4),
    add column if not exists icms_st_retained numeric(18,4),
    add column if not exists icms_st_substitute_base numeric(18,4),
    add column if not exists icms_st_substitute_value numeric(18,4),
    add column if not exists icms_st_effective_rate numeric(18,10);

-- ICMS partition (DIFAL)
alter table organization_nfe_items
    add column if not exists icms_partition_base numeric(18,4),
    add column if not exists icms_partition_fcp_rate numeric(18,10),
    add column if not exists icms_partition_internal_rate numeric(18,10),
    add column if not exists icms_partition_interstate_rate numeric(18,10),
    add column if not exists icms_partition_percent_share numeric(18,10),
    add column if not exists icms_partition_dest_value numeric(18,4),
    add column if not exists icms_partition_remet_value numeric(18,4),
    add column if not exists icms_partition_fcp_dest_value numeric(18,4);

-- ICMS monophase
alter table organization_nfe_items
    add column if not exists icms_mono_ret_base numeric(18,4),
    add column if not exists icms_mono_ret_rate numeric(18,10),
    add column if not exists icms_mono_ret_value numeric(18,4),
    add column if not exists icms_mono_retention_adrem numeric(18,4),
    add column if not exists icms_mono_retention_adspec numeric(18,4);

-- IPI
alter table organization_nfe_items
    add column if not exists ipi_class text,
    add column if not exists ipi_cnpj_producer char(14),
    add column if not exists ipi_ipi_seal_code text,
    add column if not exists ipi_ipi_seal_quantity integer,
    add column if not exists ipi_legal_framework text,
    add column if not exists ipi_cst char(2),
    add column if not exists ipi_base numeric(18,4),
    add column if not exists ipi_quantity numeric(18,4),
    add column if not exists ipi_unit_value numeric(18,10),
    add column if not exists ipi_rate numeric(18,10),
    add column if not exists ipi_value numeric(18,4);

-- II (import)
alter table organization_nfe_items
    add column if not exists ii_base numeric(18,4),
    add column if not exists ii_customs_expenses numeric(18,4),
    add column if not exists ii_value numeric(18,4),
    add column if not exists ii_iof_value numeric(18,4);

-- PIS
alter table organization_nfe_items
    add column if not exists pis_cst char(2),
    add column if not exists pis_base numeric(18,4),
    add column if not exists pis_rate numeric(18,10),
    add column if not exists pis_quantity numeric(18,4),
    add column if not exists pis_unit_value numeric(18,10),
    add column if not exists pis_value numeric(18,4);

-- PIS ST
alter table organization_nfe_items
    add column if not exists pis_st_base numeric(18,4),
    add column if not exists pis_st_rate numeric(18,10),
    add column if not exists pis_st_quantity numeric(18,4),
    add column if not exists pis_st_unit_value numeric(18,10),
    add column if not exists pis_st_value numeric(18,4);

-- COFINS
alter table organization_nfe_items
    add column if not exists cofins_cst char(2),
    add column if not exists cofins_base numeric(18,4),
    add column if not exists cofins_rate numeric(18,10),
    add column if not exists cofins_quantity numeric(18,4),
    add column if not exists cofins_unit_value numeric(18,10),
    add column if not exists cofins_value numeric(18,4);

-- COFINS ST
alter table organization_nfe_items
    add column if not exists cofins_st_base numeric(18,4),
    add column if not exists cofins_st_rate numeric(18,10),
    add column if not exists cofins_st_quantity numeric(18,4),
    add column if not exists cofins_st_unit_value numeric(18,10),
    add column if not exists cofins_st_value numeric(18,4);

-- IS (selective tax - tax reform)
alter table organization_nfe_items
    add column if not exists is_base numeric(18,4),
    add column if not exists is_rate numeric(18,10),
    add column if not exists is_quantity numeric(18,4),
    add column if not exists is_unit_value numeric(18,10),
    add column if not exists is_value numeric(18,4);

-- IBS (goods and services tax - tax reform)
alter table organization_nfe_items
    add column if not exists ibs_cst char(2),
    add column if not exists ibs_base numeric(18,4),
    add column if not exists ibs_rate numeric(18,10),
    add column if not exists ibs_value numeric(18,4);

-- CBS (contribution on goods and services - tax reform)
alter table organization_nfe_items
    add column if not exists cbs_cst char(2),
    add column if not exists cbs_base numeric(18,4),
    add column if not exists cbs_rate numeric(18,10),
    add column if not exists cbs_value numeric(18,4);

-- ============================================================================
-- CREATE child tables for arrays/nested data
-- ============================================================================

-- Referenced documents (NFref)
create table if not exists organization_nfe_referenced_docs (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    ref_type text not null,
    access_key char(44),
    uf char(2),
    year_month char(6),
    cnpj char(14),
    model text,
    series text,
    number text,
    ie text,
    cpf char(11),
    coo text,
    ecf_model text,
    ecf_number text,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_referenced_docs_document
    on organization_nfe_referenced_docs (organization_id, organization_document_id);

-- Anticipation keys (NFref)
create table if not exists organization_nfe_anticipation_keys (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    access_key char(44) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_anticipation_keys_document
    on organization_nfe_anticipation_keys (organization_id, organization_document_id);

-- Previous DFe keys (NFref)
create table if not exists organization_nfe_previous_dfe_keys (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    access_key char(44) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_previous_dfe_keys_document
    on organization_nfe_previous_dfe_keys (organization_id, organization_document_id);

-- Authorized persons to download (autXML)
create table if not exists organization_nfe_authorized_persons (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    cnpj char(14),
    cpf char(11),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_authorized_persons_document
    on organization_nfe_authorized_persons (organization_id, organization_document_id);

-- Duplicates/installments (dup)
create table if not exists organization_nfe_duplicates (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    number text not null,
    due_date date,
    value numeric(18,4),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_duplicates_document
    on organization_nfe_duplicates (organization_id, organization_document_id);

-- Payments (pag)
create table if not exists organization_nfe_payments (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    payment_indicator char(1),
    payment_method char(2) not null,
    value numeric(18,4) not null,
    card_cnpj char(14),
    card_flag text,
    card_authorization text,
    integration_type char(1),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_payments_document
    on organization_nfe_payments (organization_id, organization_document_id);

-- Trailers (reboque)
create table if not exists organization_nfe_trailers (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    plate text not null,
    uf char(2),
    rntc text,
    wagon_id text,
    ferry_id text,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_trailers_document
    on organization_nfe_trailers (organization_id, organization_document_id);

-- Volumes (vol)
create table if not exists organization_nfe_volumes (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    quantity numeric(18,4),
    species text,
    brand text,
    numbering text,
    gross_weight numeric(18,4),
    net_weight numeric(18,4),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_volumes_document
    on organization_nfe_volumes (organization_id, organization_document_id);

-- Volume seals (lacres)
create table if not exists organization_nfe_volume_seals (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    volume_id uuid not null references organization_nfe_volumes(id) on delete cascade,
    seal_number text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_volume_seals_volume
    on organization_nfe_volume_seals (organization_id, volume_id);

-- Contributor notes (obsCont)
create table if not exists organization_nfe_contributor_notes (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    field_code text not null,
    field_text text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_contributor_notes_document
    on organization_nfe_contributor_notes (organization_id, organization_document_id);

-- Fisco notes (obsFisco)
create table if not exists organization_nfe_fisco_notes (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    field_code text not null,
    field_text text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_fisco_notes_document
    on organization_nfe_fisco_notes (organization_id, organization_document_id);

-- Referenced processes (procRef)
create table if not exists organization_nfe_referenced_processes (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    process_number text not null,
    process_origin char(1) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_referenced_processes_document
    on organization_nfe_referenced_processes (organization_id, organization_document_id);

-- Sugarcane harvest days (forDia)
create table if not exists organization_nfe_sugarcane_days (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    harvest_day char(2) not null,
    quantity numeric(18,4) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_sugarcane_days_document
    on organization_nfe_sugarcane_days (organization_id, organization_document_id);

-- Sugarcane deductions (deduc)
create table if not exists organization_nfe_sugarcane_deductions (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    deduction_code text not null,
    deduction_description text,
    deduction_value numeric(18,4) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_sugarcane_deductions_document
    on organization_nfe_sugarcane_deductions (organization_id, organization_document_id);

-- Agro prescriptions (rastro agro)
create table if not exists organization_nfe_agro_prescriptions (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    prescription_number text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_agro_prescriptions_document
    on organization_nfe_agro_prescriptions (organization_id, organization_document_id);

-- Item NVEs (NVE)
create table if not exists organization_nfe_item_nves (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid not null references organization_nfe_items(id) on delete cascade,
    nve_code text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_nves_item
    on organization_nfe_item_nves (organization_id, organization_nfe_item_id);

-- Item imports (DI)
create table if not exists organization_nfe_item_imports (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid not null references organization_nfe_items(id) on delete cascade,
    di_number text not null,
    di_date date,
    customs_clearance_location text,
    customs_clearance_uf char(2),
    customs_clearance_date date,
    transport_code char(1),
    afrmm_value numeric(18,4),
    intermediary_import_code char(1),
    exporter_cnpj char(14),
    exporter_uf char(2),
    exporter_location text,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_imports_item
    on organization_nfe_item_imports (organization_id, organization_nfe_item_id);

-- Item import additions (adi)
create table if not exists organization_nfe_item_import_additions (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    import_id uuid not null references organization_nfe_item_imports(id) on delete cascade,
    addition_number integer not null,
    addition_sequence integer,
    manufacturer_code text,
    discount_value numeric(18,4),
    drawback_number text,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_import_additions_import
    on organization_nfe_item_import_additions (organization_id, import_id);

-- Item exports (detExport)
create table if not exists organization_nfe_item_exports (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid not null references organization_nfe_items(id) on delete cascade,
    drawback_number text,
    re_number text,
    chave_nfe_received text,
    quantity_exported numeric(18,4),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_exports_item
    on organization_nfe_item_exports (organization_id, organization_nfe_item_id);

-- Item traceability (rastro)
create table if not exists organization_nfe_item_traces (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid not null references organization_nfe_items(id) on delete cascade,
    batch_number text,
    batch_quantity numeric(18,4),
    manufacture_date date,
    expiry_date date,
    agregate_code text,
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_traces_item
    on organization_nfe_item_traces (organization_id, organization_nfe_item_id);

-- Item fuel origins (encerrante)
create table if not exists organization_nfe_item_fuel_origins (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid not null references organization_nfe_items(id) on delete cascade,
    pump_number text,
    nozzle_number text,
    tank_number text,
    initial_value numeric(18,4),
    final_value numeric(18,4),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_fuel_origins_item
    on organization_nfe_item_fuel_origins (organization_id, organization_nfe_item_id);

-- Item presumed credits (ICMSUFDest presumido)
create table if not exists organization_nfe_item_presumed_credits (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_document_id uuid not null references organization_documents(id) on delete cascade,
    organization_nfe_item_id uuid not null references organization_nfe_items(id) on delete cascade,
    base numeric(18,4),
    presumed_percentage numeric(18,10),
    presumed_value numeric(18,4),
    created_at timestamptz not null default now()
);

create index if not exists idx_nfe_item_presumed_credits_item
    on organization_nfe_item_presumed_credits (organization_id, organization_nfe_item_id);

-- ============================================================================
-- Indexes for reporting queries
-- ============================================================================

create index if not exists idx_nfe_issuer_cnpj_issued_at
    on organization_nfe (organization_id, issuer_cnpj, issued_at)
    where issuer_cnpj is not null;

create index if not exists idx_nfe_recipient_document_issued_at
    on organization_nfe (organization_id, recipient_document, issued_at)
    where recipient_document is not null;

create index if not exists idx_nfe_recipient_uf_issued_at
    on organization_nfe (organization_id, uf_recipient, issued_at)
    where uf_recipient is not null;

create index if not exists idx_nfe_access_key_issued_at
    on organization_nfe (organization_id, issued_at)
    where access_key is not null;

create index if not exists idx_nfe_items_ncm
    on organization_nfe_items (organization_id, ncm)
    where ncm is not null;

create index if not exists idx_nfe_items_cfop
    on organization_nfe_items (organization_id, cfop)
    where cfop is not null;

create index if not exists idx_nfe_items_icms_cst
    on organization_nfe_items (organization_id, icms_cst)
    where icms_cst is not null;

create index if not exists idx_nfe_items_ibs_cbs_cst
    on organization_nfe_items (organization_id, ibs_cst, cbs_cst)
    where ibs_cst is not null or cbs_cst is not null;

-- ============================================================================
-- Down migration: DROP statements (reverse order)
-- ============================================================================

-- Drop indexes
-- drop index if exists idx_nfe_items_ibs_cbs_cst;
-- drop index if exists idx_nfe_items_icms_cst;
-- drop index if exists idx_nfe_items_cfop;
-- drop index if exists idx_nfe_items_ncm;
-- drop index if exists idx_nfe_access_key_issued_at;
-- drop index if exists idx_nfe_recipient_uf_issued_at;
-- drop index if exists idx_nfe_recipient_document_issued_at;
-- drop index if exists idx_nfe_issuer_cnpj_issued_at;

-- Drop child tables
-- drop table if exists organization_nfe_item_presumed_credits;
-- drop table if exists organization_nfe_item_fuel_origins;
-- drop table if exists organization_nfe_item_traces;
-- drop table if exists organization_nfe_item_exports;
-- drop table if exists organization_nfe_item_import_additions;
-- drop table if exists organization_nfe_item_imports;
-- drop table if exists organization_nfe_item_nves;
-- drop table if exists organization_nfe_agro_prescriptions;
-- drop table if exists organization_nfe_sugarcane_deductions;
-- drop table if exists organization_nfe_sugarcane_days;
-- drop table if exists organization_nfe_referenced_processes;
-- drop table if exists organization_nfe_fisco_notes;
-- drop table if exists organization_nfe_contributor_notes;
-- drop table if exists organization_nfe_volume_seals;
-- drop table if exists organization_nfe_volumes;
-- drop table if exists organization_nfe_trailers;
-- drop table if exists organization_nfe_payments;
-- drop table if exists organization_nfe_duplicates;
-- drop table if exists organization_nfe_authorized_persons;
-- drop table if exists organization_nfe_previous_dfe_keys;
-- drop table if exists organization_nfe_anticipation_keys;
-- drop table if exists organization_nfe_referenced_docs;

-- Drop columns from organization_nfe_items
-- (Note: PostgreSQL does not support IF EXISTS for DROP COLUMN in older versions,
--  so these would need to be run conditionally in production)
-- alter table organization_nfe_items drop column if exists cbs_value;
-- alter table organization_nfe_items drop column if exists cbs_rate;
-- alter table organization_nfe_items drop column if exists cbs_base;
-- alter table organization_nfe_items drop column if exists cbs_cst;
-- ... (full list omitted for brevity - mirror all added columns)

-- Drop columns from organization_nfe
-- alter table organization_nfe drop column if exists prev_social_valor_retido;
-- alter table organization_nfe drop column if exists prev_social_cofins_value;
-- alter table organization_nfe drop column if exists prev_social_cofins_base;
-- ... (full list omitted for brevity - mirror all added columns)
