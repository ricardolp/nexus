-- +migrate Up

-- ============================================================================
-- fiscal_document_query_requests/_items (migration 015) were added after
-- 013_nfe_gateway_scoped_role.sql created nfe_gateway_role — the role never
-- got a grant on them, so nfe_gateway/db.py's claim_pending_query_requests
-- (used by workers/query_worker.py) fails at the Postgres level with
-- InsufficientPrivilegeError. Confirmed live 2026-08-17: the on-demand "por
-- NSU"/"por chave" query feature has never actually been exercised against
-- a real running query_worker before now. Grants mirror the read/write shape
-- db.py actually performs (select + update on requests, select + update on
-- items; no insert/delete — the Go side owns those).
-- ============================================================================

grant select, update on fiscal_document_query_requests to nfe_gateway_role;
grant select, update on fiscal_document_query_items to nfe_gateway_role;

-- +migrate Down

revoke all privileges on fiscal_document_query_requests from nfe_gateway_role;
revoke all privileges on fiscal_document_query_items from nfe_gateway_role;
