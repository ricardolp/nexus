-- ============================================================================
-- 036_nfe_outbound_reforma_contingencia.sql
-- Contingency (tpEmis), reforma IBS UF/Mun, cBenef, ICMS51 deferral, finNFe 5/6
-- ============================================================================

alter table organization_nfe
    add column if not exists emission_type char(1),
    add column if not exists access_key_precomputed text,
    add column if not exists contingency_at timestamptz,
    add column if not exists contingency_justification text,
    add column if not exists tp_nf_debito char(2),
    add column if not exists tp_nf_credito char(2),
    add column if not exists municipality_code_fg char(7),
    add column if not exists municipality_code_fg_ibs char(7),
    add column if not exists total_ibs_uf numeric(18,4),
    add column if not exists total_ibs_mun numeric(18,4);

-- Item-level reforma / ICMS51 / cBenef gaps
alter table organization_nfe_items
    add column if not exists cbenef text,
    add column if not exists icms_valor_operacao numeric(18,4),
    add column if not exists icms_percentual_diferimento numeric(18,4),
    add column if not exists icms_valor_diferido numeric(18,4),
    add column if not exists ibs_c_class_trib char(6),
    add column if not exists ibs_aliquota_uf numeric(18,4),
    add column if not exists ibs_valor_uf numeric(18,4),
    add column if not exists ibs_aliquota_mun numeric(18,4),
    add column if not exists ibs_valor_mun numeric(18,4),
    add column if not exists cbs_c_class_trib char(6),
    add column if not exists is_c_class_trib char(6),
    add column if not exists ibscbs_q_bc_mono numeric(18,4),
    add column if not exists ibscbs_ad_rem_ibs numeric(18,4),
    add column if not exists ibscbs_v_ibs_mono numeric(18,4),
    add column if not exists ibscbs_ad_rem_cbs numeric(18,4),
    add column if not exists ibscbs_v_cbs_mono numeric(18,4);

alter table organization_nfe_item_presumed_credits
    add column if not exists codigo_credito_presumido text;
