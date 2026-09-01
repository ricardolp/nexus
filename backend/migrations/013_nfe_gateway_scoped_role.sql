-- +migrate Up

-- ============================================================================
-- Role de banco dedicada ao processo nfe-gateway (Python) — hoje ele conecta
-- com o MESMO usuário `fiscal` que o backend Go usa, então nada no Postgres
-- impede o processo do gateway de ler/escrever em organization_documents,
-- certificados etc., mesmo que o código Python nunca faça isso hoje. Essa
-- separação existia só como disciplina de código, não como fronteira real.
--
-- Esta role só recebe GRANT no que o nfe-gateway de fato usa (ver
-- nfe_gateway/db.py, credentials.py, broker.py): as tabelas que ele é dono
-- (distribution_state/_polls, inbox_events, org_credentials) e leitura de
-- organization_companies (uf/cnpj/environment, join de claim_due_companies).
-- Nada de organization_documents, certificados, organizations, users etc. —
-- se o processo do gateway for comprometido, o Postgres em si já bloqueia
-- acesso a dado fiscal fora do escopo dele, não só o código.
--
-- Senha abaixo é um default de dev local, mesmo padrão já usado em
-- NFE_GATEWAY_SERVICE_TOKEN (backend/.env.example) — QUALQUER deployment
-- real deve rodar ALTER ROLE nfe_gateway_role PASSWORD '...' com um valor
-- próprio antes de ir pra produção.
-- ============================================================================

do $$
declare
  dbname text := current_database();
begin
    if not exists (select 1 from pg_roles where rolname = 'nfe_gateway_role') then
        create role nfe_gateway_role with login password 'local-dev-nfe-gateway-role-do-not-use-in-production';
    end if;
    execute format('grant connect on database %I to nfe_gateway_role', dbname);
end
$$;

grant usage on schema public to nfe_gateway_role;

-- Tabelas que o nfe-gateway é dono — leitura e escrita.
grant select, insert, update on organization_company_nfe_distribution_state to nfe_gateway_role;
grant select, insert on organization_company_nfe_distribution_polls to nfe_gateway_role;
grant select, insert on nfe_gateway_inbox_events to nfe_gateway_role;
grant select, insert, update on nfe_gateway_organization_credentials to nfe_gateway_role;

-- Leitura only do que o Go/backend é dono — nada de write aqui.
grant select on organization_companies to nfe_gateway_role;

-- +migrate Down

revoke all privileges on organization_company_nfe_distribution_state from nfe_gateway_role;
revoke all privileges on organization_company_nfe_distribution_polls from nfe_gateway_role;
revoke all privileges on nfe_gateway_inbox_events from nfe_gateway_role;
revoke all privileges on nfe_gateway_organization_credentials from nfe_gateway_role;
revoke all privileges on organization_companies from nfe_gateway_role;
revoke usage on schema public from nfe_gateway_role;
do $$
declare
  dbname text := current_database();
begin
    execute format('revoke connect on database %I from nfe_gateway_role', dbname);
end
$$;
drop role if exists nfe_gateway_role;
