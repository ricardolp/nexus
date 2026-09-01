-- +migrate Up

-- ============================================================================
-- Documentos vistos na distribuição por NSU/chave mas ainda não manifestados
-- (resNFe/resEvento/procEventoNFe — sem <infNFe>, o backend não consegue
-- resolver organization_company_id nem ingerir como documento completo, ver
-- migration 007's docs e backend/docs/architecture/22_nfe_gateway_service.md).
-- Propriedade do nfe-gateway (Python) — descobre e escreve aqui; o backend
-- (Go) só lê, mesmo padrão de organization_company_nfe_distribution_state.
--
-- Uma vez enviada a Ciência da Operação (210210) e reconsultado, o mesmo
-- chave passa a vir como procNFe completo pela distribuição — nesse ponto
-- o documento real é criado em organization_documents pelo caminho normal
-- (POST /v1/inbound/fiscal_documents/nfe) e esta linha aqui é só marcada
-- 'manifested', não apagada (mantém o histórico de quando cada nota apareceu
-- pela primeira vez como pendente).
-- ============================================================================

create table nfe_pending_manifestation_documents (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    organization_company_id uuid not null references organization_companies(id),
    chave varchar(44) not null,
    nsu bigint not null,
    schema varchar(40) not null,
    cnpj_emitente varchar(14),
    nome_emitente text,
    valor numeric(15, 2),
    data_emissao timestamptz,
    protocolo text,
    situacao text,
    status varchar(20) not null default 'pending'
        check (status in ('pending', 'manifesting', 'manifested', 'error')),
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    manifested_at timestamptz,
    unique (organization_company_id, chave)
);

create index idx_nfe_pending_manifestation_org
    on nfe_pending_manifestation_documents (organization_id, created_at desc);

create index idx_nfe_pending_manifestation_status
    on nfe_pending_manifestation_documents (organization_company_id, status);

grant select, insert, update on nfe_pending_manifestation_documents to nfe_gateway_role;

-- +migrate Down

revoke all privileges on nfe_pending_manifestation_documents from nfe_gateway_role;
drop table if exists nfe_pending_manifestation_documents;
