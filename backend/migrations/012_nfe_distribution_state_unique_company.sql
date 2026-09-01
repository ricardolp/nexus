-- +migrate Up

-- ============================================================================
-- migration 011 dropped organization_company_nfe_distribution_state.environment,
-- which silently took its dependent `unique (organization_company_id,
-- environment)` constraint down with it (Postgres cascades that
-- automatically on DROP COLUMN) — leaving no uniqueness guard on
-- organization_company_id at all. Since environment no longer lives on this
-- table (sourced from organization_companies via join, a company can't be
-- both environments at once), the correct replacement is uniqueness on
-- organization_company_id alone: one distribution-state row per company.
-- ============================================================================

alter table organization_company_nfe_distribution_state
    add constraint organization_company_nfe_distribution_state_company_unique
    unique (organization_company_id);

-- +migrate Down

alter table organization_company_nfe_distribution_state
    drop constraint if exists organization_company_nfe_distribution_state_company_unique;
