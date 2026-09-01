-- +migrate Up

-- ============================================================================
-- Bloqueio por tentativas em POST /v1/oauth/token — defesa em profundidade,
-- não a proteção primária (client_secret já tem 256 bits de entropia,
-- crypto.RandomToken(32), então força bruta online não é viável na prática;
-- isso protege contra abuso/ruído — um integrador mal configurado batendo
-- repetidamente, ou automação hostil). Chave é o client_id cru, não uma FK —
-- funciona igual para client_id inexistente (também protege contra
-- enumeração) e existente.
-- ============================================================================

create table organization_api_client_auth_attempts (
    client_id text primary key,
    failed_count integer not null default 0,
    window_started_at timestamptz not null default now(),
    locked_until timestamptz
);

-- +migrate Down

drop table if exists organization_api_client_auth_attempts;
