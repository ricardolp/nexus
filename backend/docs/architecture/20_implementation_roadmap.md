# Roadmap de Implementação

## Fase 1 — Fundação

- convenções;
- PostgreSQL;
- migrations;
- organizations;
- users;
- memberships;
- roles;
- permissions;
- companies;
- serviços;
- auditoria básica;
- CI/CD;
- secrets manager.

## Fase 2 — Autenticação

- login;
- verificação de e-mail;
- convites;
- sessões;
- recuperação;
- TOTP;
- recovery codes;
- políticas por tenant;
- admin da plataforma;
- suporte auditado.

## Fase 3 — Inbound fiscal

- API clients;
- OAuth client credentials;
- inbound API;
- idempotência;
- object storage;
- documents;
- payloads;
- events;
- outbox.

## Fase 4 — Processamento

- broker;
- workers;
- inbox;
- retry;
- dead-letter;
- conector fiscal;
- normalização de status;
- reconciliação.

## Fase 5 — SAP e Webhooks

- organization integrations (implementado de forma simplificada — `21_fiscal_inbound_orchestrator.md`);
- secrets (cifrados em `organization_integrations.secret_ref`, sem tabela de versionamento própria ainda);
- custom headers seguros (pendente: allowlist/SSRF completos de `09_sap_integrations.md`);
- callbacks;
- subscriptions;
- assinatura HMAC;
- retries;
- replay manual.

## Fase 3.5 — Orquestrador fiscal inbound (implementado)

- motor de cenário com resolução hierárquica;
- templates de processo (`STANDARD_PURCHASE`, `EWM_PURCHASE`, `DIRECT_GR`, `SERVICE`, `FI_ONLY`);
- matching de fornecedor/material/pedido separado de validação, com De/Para reutilizável;
- correção manual (patch de item, override auditado, busca interativa de pedido);
- execution plan com dependência, idempotência e classificação de erro para retry;
- worker de etapas automáticas (`cmd/inbound_orchestrator_worker`);
- pendente: rule engine/DSL declarativo, EWM/Service Entry Sheet reais, aprovação multi-nível, KPIs.

## Fase 6 — Operação e compliance

- OpenTelemetry;
- dashboards;
- alertas;
- SIEM;
- retenção;
- LGPD;
- DR;
- pentest;
- ASVS;
- SSO OIDC/SAML;
- WebAuthn.

## Critério de pronto

Uma funcionalidade só está pronta quando possui:

- autorização;
- validação;
- auditoria;
- observabilidade;
- testes unitários;
- testes de integração;
- testes de isolamento de tenant;
- migration;
- documentação;
- tratamento de idempotência/retry quando aplicável.
