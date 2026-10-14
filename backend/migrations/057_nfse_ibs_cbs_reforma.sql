-- Reforma tributária na NFS-e Nacional (IBS/CBS).
--
-- 1) Padrões de IBS/CBS por serviço do catálogo da empresa. Quando o SAP não
--    envia CST / cClassTrib / cIndOp, o backend completa o payload a partir do
--    serviço cadastrado (match por item LC 116 e/ou NBS) antes de enviar ao
--    nfe-gateway. Sem esses campos a SEFIN não calcula IBS/CBS.
-- 2) Valores de IBS/CBS calculados pela SEFIN Nacional (infNFSe/IBSCBS) na
--    autorização. As colunas *_amount e ibs_cbs_calculation_base passam a
--    refletir o valor oficial devolvido pela SEFIN (fonte em ibs_cbs_source).

alter table organization_company_nfse_services
    add column if not exists ibs_cbs_cst char(3),
    add column if not exists ibs_cbs_class_trib char(6),
    add column if not exists ibs_cbs_operation_indicator char(6);

comment on column organization_company_nfse_services.ibs_cbs_cst is
    'CST do IBS/CBS (3 dígitos) usado quando o SAP não informa servico.ibs_cbs_situacao_tributaria.';
comment on column organization_company_nfse_services.ibs_cbs_class_trib is
    'cClassTrib (6 dígitos, começa pelo CST) usado quando o SAP não informa servico.ibs_cbs_classificacao_tributaria.';
comment on column organization_company_nfse_services.ibs_cbs_operation_indicator is
    'cIndOp (Anexo VII da NFS-e, 6 dígitos) usado quando o SAP não informa servico.codigo_indicador_operacao.';

alter table organization_nfse
    add column if not exists ibs_cbs_operation_indicator char(6),
    add column if not exists ibs_cbs_incidence_municipality_code char(7),
    add column if not exists ibs_cbs_incidence_municipality_name text,
    add column if not exists ibs_uf_rate_pct numeric(9,4),
    add column if not exists ibs_mun_rate_pct numeric(9,4),
    add column if not exists cbs_rate_pct numeric(9,4),
    add column if not exists ibs_uf_effective_rate_pct numeric(9,4),
    add column if not exists ibs_mun_effective_rate_pct numeric(9,4),
    add column if not exists cbs_effective_rate_pct numeric(9,4),
    add column if not exists ibs_amount numeric(18,4),
    add column if not exists total_with_ibs_cbs numeric(18,4),
    add column if not exists ibs_cbs_source text,
    add column if not exists ibs_cbs_calculated_at timestamptz,
    add column if not exists ibs_cbs_sefin_json jsonb;

comment on column organization_nfse.ibs_cbs_source is
    'sap = valores enviados pelo SAP na DPS; sefin = valores calculados pela SEFIN Nacional e devolvidos na NFS-e autorizada.';
comment on column organization_nfse.ibs_cbs_sefin_json is
    'Grupo IBSCBS da NFS-e autorizada (infNFSe/IBSCBS) normalizado pelo nfe-gateway.';
