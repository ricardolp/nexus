-- +migrate Up

-- ============================================================================
-- UF (unidade federativa) da empresa — necessária para saber qual webservice
-- da SEFAZ chamar (o endpoint é selecionado por UF, não só por ambiente).
-- Nada no schema capturava isso até agora. Nullable porque empresas já
-- cadastradas não têm o dado — mas nenhuma distribuição/emissão real pode
-- rodar para uma empresa sem UF preenchida.
-- ============================================================================

alter table organization_companies
    add column uf char(2);

-- organization_company_nfe_distribution_state duplicava uf/environment, que
-- já vêm de organization_companies (join por organization_company_id) — dado
-- duplicado sem nada escrevendo nele ainda arriscava ficar desatualizado se a
-- UF/ambiente da empresa fosse corrigido depois. Nenhuma linha real existe
-- ainda nesta tabela (só dados de teste, já removidos), então não há dado a
-- migrar.
alter table organization_company_nfe_distribution_state
    drop column if exists uf,
    drop column if exists environment;

-- +migrate Down

alter table organization_company_nfe_distribution_state
    add column uf varchar(2) not null default '',
    add column environment varchar(20) not null default 'homologation'
        check (environment in ('production', 'homologation'));

alter table organization_companies
    drop column if exists uf;
