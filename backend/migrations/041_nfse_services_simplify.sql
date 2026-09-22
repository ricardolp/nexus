-- ============================================================================
-- 041_nfse_services_simplify.sql
-- Atividades NFS-e da empresa: CNAE + descrição na UI.
-- Item LC116 e NBS passam a ser opcionais no catálogo (escolhidos na emissão).
-- ============================================================================

alter table organization_company_nfse_services
    alter column service_list_item drop not null,
    alter column nbs_code drop not null;

alter table organization_company_nfse_services
    drop constraint if exists organization_company_nfse_services_organization_company_id_cnae_code_service_list_item_nbs_code_key;

create unique index if not exists uq_org_company_nfse_services_cnae_desc
    on organization_company_nfse_services (
        organization_company_id,
        cnae_code,
        coalesce(lower(trim(service_description)), '')
    );
