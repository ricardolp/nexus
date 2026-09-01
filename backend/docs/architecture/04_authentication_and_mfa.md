# Autenticação, SSO e MFA

## `organization_authentication_settings`

Uma linha por organização.

Campos sugeridos:

- `organization_id`
- `password_login_enabled`
- `sso_enabled`
- `sso_required`
- `email_verification_required`
- `mfa_required`
- `mfa_methods`
- `minimum_password_length`
- `session_idle_timeout_minutes`
- `session_absolute_timeout_minutes`
- `allowed_email_domains`
- `invite_domain_restriction_enabled`
- `password_breach_check_enabled`
- `created_at`
- `updated_at`

## Política de senha

Não criar exigências artificiais de maiúscula, número e símbolo. Priorizar:

- comprimento;
- bloqueio de senhas comprometidas/comuns;
- Argon2id;
- rate limiting;
- MFA;
- recuperação segura;
- sessões revogáveis.

Para login apenas por senha, adotar mínimo forte. Quando senha faz parte de MFA, o tenant pode escolher um mínimo menor, dentro do piso global da plataforma.

## MFA próprio

### Métodos iniciais

- TOTP;
- códigos de recuperação;
- WebAuthn/passkeys como evolução recomendada.

Evitar SMS como fator principal.

### Entidades

- `user_mfa_methods`
- `user_mfa_recovery_codes`
- `authentication_challenges`
- `user_sessions`
- `refresh_tokens`
- `authentication_events`

Seeds e recovery codes devem ser criptografados/hasheados conforme a necessidade de uso. Recovery code é armazenado como hash e consumido uma única vez.

## SSO

### `organization_identity_providers`

Campos:

- `organization_id`
- `provider_type`: `oidc` ou `saml`
- `name`
- `issuer`
- `client_id`
- `client_secret_secret_ref`
- `authorization_url`
- `token_url`
- `jwks_url`
- `metadata_url`
- `domains`
- `jit_provisioning_enabled`
- `default_role_id`
- `status`

Para OIDC, validar issuer, audience, nonce, state, PKCE e assinatura. Para SAML, validar assinatura, audience, recipient, timestamps e replay.

## Convites

Fluxo:

1. `admin`, `system` ou `support` cria o usuário por `POST /v1/users`;
2. usuário e membership são persistidos como `pending`/`invited`;
3. o token de uso único é armazenado somente como hash em `user_invitations`;
4. o evento `identity.user_invited.v1` é gravado na outbox para entrega do e-mail;
5. o usuário aceita por `POST /v1/auth/invitations/accept`;
6. e-mail, usuário e membership são ativados;
7. convite é marcado como aceito;
8. evento de auditoria é criado.

Não existe rota pública de cadastro.
