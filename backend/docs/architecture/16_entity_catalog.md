# Catálogo de Entidades

## Plataforma

- `users`
- `user_emails`
- `user_sessions`
- `refresh_tokens`
- `user_mfa_methods`
- `user_mfa_recovery_codes`
- `authentication_challenges`
- `authentication_events`
- `platform_support_sessions`
- `platform_admin_actions`

## Tenant e acesso

- `organizations`
- `organization_members`
- `organization_roles`
- `organization_permissions`
- `organization_member_roles`
- `organization_invitations`
- `organization_authentication_settings`
- `organization_identity_providers`
- `organization_domains`

## Empresas e serviços

- `organization_companies`
- `organization_company_certificates`
- `services`
- `organization_company_services`

## Credenciais técnicas

- `organization_api_clients`
- `organization_api_client_credentials`
- `organization_api_client_scopes`
- `organization_api_client_ip_rules`

## Integrações

- `organization_integrations`
- `organization_integration_credentials`
- `organization_integration_headers`
- `organization_integration_health_checks`

## Fiscal

- `organization_documents`
- `organization_nfe`
- `organization_nfse`
- `organization_document_payloads`
- `organization_document_events`
- `organization_document_attempts`
- `organization_document_errors`
- `organization_document_links`

## Fiscal Inbound Orchestrator

Ver `21_fiscal_inbound_orchestrator.md`. Referenciam `organization_documents` por FK em vez de duplicar cabeçalho/status.

- `organization_inbound_scenarios`
- `organization_inbound_scenario_rules`
- `organization_nfe_items`
- `organization_document_matches`
- `organization_document_validations`
- `organization_document_overrides`
- `organization_vendor_material_mappings`
- `organization_execution_plans`
- `organization_execution_plan_steps`

## Mensageria

- `outbox_events`
- `inbox_events`
- `dead_letter_events`
- `scheduled_jobs`
- `job_executions`

## Webhooks

- `organization_webhook_endpoints`
- `organization_webhook_subscriptions`
- `webhook_events`
- `webhook_deliveries`

## Comunicação

- `email_templates`
- `email_messages`
- `email_deliveries`
- `notifications`

## Auditoria e observabilidade

- `request_traces`
- `audit_events`
- `security_events`
- `data_access_events`
- `retention_executions`
