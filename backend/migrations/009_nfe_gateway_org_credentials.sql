-- +migrate Up

-- ============================================================================
-- Credenciais OAuth (client_credentials) que o nfe-gateway usa para chamar
-- POST /v1/inbound/fiscal_documents/nfe — o mesmo endpoint que qualquer ERP
-- usaria, autenticado como um organization_api_client normal (ver
-- 07_inbound_api.md), não pelo token estático do internal_api. Como cada
-- organization_api_client pertence a uma única organização, o gateway
-- precisa de um client_id/client_secret por organização — provisionados uma
-- vez (POST /v1/organizations/{id}/api_clients, source_system
-- "nfe_gateway_distribution", scope fiscal_documents:create) e guardados
-- aqui, já que o backend nunca reexpõe o client_secret depois de criado
-- (fica só hash). Propriedade do nfe-gateway — ver
-- docs/architecture/22_nfe_gateway_service.md.
-- ============================================================================

create table nfe_gateway_organization_credentials (
    organization_id uuid primary key references organizations(id),
    client_id text not null,
    client_secret_encrypted text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- +migrate Down

drop table if exists nfe_gateway_organization_credentials;
