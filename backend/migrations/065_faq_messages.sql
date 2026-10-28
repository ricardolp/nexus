-- +migrate Up
-- ============================================================================
-- 065_faq_messages.sql
-- Operational help articles for SAP monitor error codes + consultation hits.
-- ============================================================================

create table if not exists faq_messages (
    id uuid primary key,
    source varchar(16) not null
        check (source in ('SEFAZ', 'SAP', 'API', 'NEXUS')),
    code text not null,
    docsta text not null default '',
    lang varchar(8) not null default 'PT',
    severity varchar(16) not null
        check (severity in ('DENIED', 'REJECTED', 'TECHNICAL', 'UNKNOWN')),
    title text not null,
    summary text not null,
    steps jsonb not null default '[]'::jsonb,
    forbidden_actions jsonb not null default '[]'::jsonb,
    recommended_action varchar(32) not null default 'NONE'
        check (recommended_action in (
            'REVERSE_SOURCE',
            'RESET_AND_RESEND',
            'WAIT_RETRY',
            'CONTACT_SUPPORT',
            'NONE'
        )),
    faq_slug text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source, code, docsta, lang)
);

create index if not exists idx_faq_messages_lookup
    on faq_messages (source, code, lang)
    where active;

create index if not exists idx_faq_messages_active_updated
    on faq_messages (active, updated_at desc);

create table if not exists faq_hits (
    id uuid primary key,
    organization_id uuid not null references organizations(id),
    source varchar(16) not null,
    code text not null,
    docsta text not null default '',
    found boolean not null,
    docnum text,
    model text,
    message_truncated text,
    created_at timestamptz not null default now()
);

create index if not exists idx_faq_hits_missing
    on faq_hits (found, source, code, created_at desc);

create index if not exists idx_faq_hits_org_created
    on faq_hits (organization_id, created_at desc);

create index if not exists idx_faq_hits_top
    on faq_hits (source, code, created_at desc);

-- Seed: SEFAZ denials (docsta 3)
insert into faq_messages (
    id, source, code, docsta, lang, severity, title, summary, steps, forbidden_actions,
    recommended_action, faq_slug, active, created_at, updated_at
) values
(
    '01900000-0000-7000-8000-000000000110',
    'SEFAZ', '110', '3', 'PT', 'DENIED',
    'Uso denegado pela SEFAZ (110)',
    'A SEFAZ denegou o uso desta NF-e. O número não pode ser reutilizado; estorne a origem e emita nova nota.',
    '["Verificar o motivo da denegação no retorno da SEFAZ","Estornar o documento de origem no monitor","Corrigir a causa no cadastro/processo","Emitir nova NF-e com novo número"]'::jsonb,
    '["Reinicializar documento","Reenviar a mesma nota"]'::jsonb,
    'REVERSE_SOURCE', 'sefaz-110', true, now(), now()
),
(
    '01900000-0000-7000-8000-000000000205',
    'SEFAZ', '205', '3', 'PT', 'DENIED',
    'Uso denegado pela SEFAZ',
    'A SEFAZ negou definitivamente o uso desta NF-e. O número não pode ser reutilizado.',
    '["Verificar o motivo no cadastro do destinatário (IE irregular etc.)","Estornar o documento de origem no monitor","Corrigir a causa","Emitir nova NF-e com novo número"]'::jsonb,
    '["Reinicializar documento","Reenviar a mesma nota"]'::jsonb,
    'REVERSE_SOURCE', 'sefaz-205', true, now(), now()
),
(
    '01900000-0000-7000-8000-000000000301',
    'SEFAZ', '301', '3', 'PT', 'DENIED',
    'Uso denegado — irregularidade fiscal do emitente (301)',
    'A SEFAZ denegou por irregularidade fiscal do emitente. Não reutilize o número; regularize e emita nova NF-e.',
    '["Consultar a situação cadastral do emitente junto à SEFAZ","Estornar o documento de origem no monitor","Regularizar a pendência fiscal","Emitir nova NF-e com novo número"]'::jsonb,
    '["Reinicializar documento","Reenviar a mesma nota"]'::jsonb,
    'REVERSE_SOURCE', 'sefaz-301', true, now(), now()
),
(
    '01900000-0000-7000-8000-000000000302',
    'SEFAZ', '302', '3', 'PT', 'DENIED',
    'Uso denegado — irregularidade fiscal do destinatário (302)',
    'A SEFAZ denegou por irregularidade fiscal do destinatário. Estorne a origem, corrija o cadastro e emita nova nota.',
    '["Verificar IE/CNPJ do destinatário","Estornar o documento de origem no monitor","Corrigir o cadastro do parceiro","Emitir nova NF-e com novo número"]'::jsonb,
    '["Reinicializar documento","Reenviar a mesma nota"]'::jsonb,
    'REVERSE_SOURCE', 'sefaz-302', true, now(), now()
),
(
    '01900000-0000-7000-8000-000000000303',
    'SEFAZ', '303', '3', 'PT', 'DENIED',
    'Uso denegado — destinatário não habilitado (303)',
    'A SEFAZ denegou porque o destinatário não está habilitado a operar na UF. Estorne e corrija antes de nova emissão.',
    '["Confirmar habilitação do destinatário na UF","Estornar o documento de origem no monitor","Corrigir dados cadastrais","Emitir nova NF-e com novo número"]'::jsonb,
    '["Reinicializar documento","Reenviar a mesma nota"]'::jsonb,
    'REVERSE_SOURCE', 'sefaz-303', true, now(), now()
),
-- Generic SEFAZ by docsta
(
    '01900000-0000-7000-8000-00000000d002',
    'SEFAZ', '*', '2', 'PT', 'REJECTED',
    'Rejeição SEFAZ (docsta 2)',
    'A SEFAZ rejeitou a NF-e. Em geral o número pode ser reutilizado após correção; reinicie e reenvie.',
    '["Ler o xMotivo / cStat no retorno","Corrigir a causa da rejeição","Reinicializar o documento no monitor","Reenviar a NF-e"]'::jsonb,
    '["Ignorar o motivo e reenviar sem correção"]'::jsonb,
    'RESET_AND_RESEND', 'sefaz-docsta-2', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000d003',
    'SEFAZ', '*', '3', 'PT', 'DENIED',
    'Denegação SEFAZ (docsta 3)',
    'Uso denegado pela SEFAZ. Não reutilize o número; estorne a origem e emita nova NF-e.',
    '["Confirmar cStat de denegação","Estornar o documento de origem no monitor","Corrigir a causa","Emitir nova NF-e com novo número"]'::jsonb,
    '["Reinicializar documento","Reenviar a mesma nota"]'::jsonb,
    'REVERSE_SOURCE', 'sefaz-docsta-3', true, now(), now()
),
-- API technical
(
    '01900000-0000-7000-8000-00000000400',
    'API', 'HTTP_400', '', 'PT', 'TECHNICAL',
    'Requisição inválida (HTTP 400)',
    'A API rejeitou o payload. Verifique campos obrigatórios e formato antes de reenviar.',
    '["Conferir o corpo/headers da requisição","Corrigir validação apontada no retorno","Reenviar a chamada"]'::jsonb,
    '[]'::jsonb,
    'CONTACT_SUPPORT', 'api-http-400', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000401',
    'API', 'HTTP_401', '', 'PT', 'TECHNICAL',
    'Não autorizado (HTTP 401)',
    'Credencial ou token inválido/expirado. Renove a autenticação e tente novamente.',
    '["Verificar X-Org-Token ou Bearer","Renovar token OAuth se aplicável","Repetir a chamada"]'::jsonb,
    '[]'::jsonb,
    'CONTACT_SUPPORT', 'api-http-401', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000403',
    'API', 'HTTP_403', '', 'PT', 'TECHNICAL',
    'Acesso negado (HTTP 403)',
    'O cliente não tem permissão/escopo para a operação. Ajuste credenciais ou escopos.',
    '["Conferir escopos do api client","Validar empresa/organização","Contatar suporte se o acesso for esperado"]'::jsonb,
    '[]'::jsonb,
    'CONTACT_SUPPORT', 'api-http-403', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000429',
    'API', 'HTTP_429', '', 'PT', 'TECHNICAL',
    'Limite de taxa (HTTP 429)',
    'Muitas requisições em pouco tempo. Aguarde e tente novamente com backoff.',
    '["Aguardar o intervalo indicado","Reduzir paralelismo","Repetir com retry"]'::jsonb,
    '[]'::jsonb,
    'WAIT_RETRY', 'api-http-429', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000500',
    'API', 'HTTP_500', '', 'PT', 'TECHNICAL',
    'Erro interno da API (HTTP 500)',
    'Falha temporária no servidor. Aguarde e tente novamente; se persistir, acione o suporte.',
    '["Aguardar alguns minutos","Repetir a operação","Abrir chamado se o erro continuar"]'::jsonb,
    '[]'::jsonb,
    'WAIT_RETRY', 'api-http-500', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000502',
    'API', 'HTTP_502', '', 'PT', 'TECHNICAL',
    'Gateway inválido (HTTP 502)',
    'Falha de gateway/proxy. Em geral é transitória — aguarde e reenvie.',
    '["Aguardar e tentar novamente","Verificar status da plataforma","Contatar suporte se recorrente"]'::jsonb,
    '[]'::jsonb,
    'WAIT_RETRY', 'api-http-502', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000503',
    'API', 'HTTP_503', '', 'PT', 'TECHNICAL',
    'Serviço indisponível (HTTP 503)',
    'Serviço temporariamente indisponível. Aguarde e tente novamente.',
    '["Aguardar a restauração do serviço","Repetir com backoff","Consultar status da plataforma"]'::jsonb,
    '[]'::jsonb,
    'WAIT_RETRY', 'api-http-503', true, now(), now()
),
-- NEXUS
(
    '01900000-0000-7000-8000-00000000e001',
    'NEXUS', 'ERROR', '', 'PT', 'TECHNICAL',
    'Erro técnico Nexus',
    'Ocorreu um erro técnico no processamento Nexus. Verifique o detalhe e acione o suporte se necessário.',
    '["Ler a mensagem de erro no monitor","Tentar novamente se for transitório","Abrir chamado com docnum e horário"]'::jsonb,
    '[]'::jsonb,
    'CONTACT_SUPPORT', 'nexus-error', true, now(), now()
),
(
    '01900000-0000-7000-8000-00000000e002',
    'NEXUS', 'REJECTED', '', 'PT', 'TECHNICAL',
    'Documento rejeitado pelo Nexus',
    'O Nexus rejeitou o documento por regra de negócio ou validação. Corrija e reenvie ou contate o suporte.',
    '["Ler o motivo da rejeição","Corrigir dados/processo","Reenviar ou abrir chamado"]'::jsonb,
    '[]'::jsonb,
    'CONTACT_SUPPORT', 'nexus-rejected', true, now(), now()
)
on conflict (source, code, docsta, lang) do nothing;

-- +migrate Down

drop table if exists faq_hits;
drop table if exists faq_messages;
