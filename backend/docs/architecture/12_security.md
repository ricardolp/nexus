# Segurança

## Baseline

Adotar OWASP ASVS 5.0 como checklist de desenvolvimento e teste.

## Controles essenciais

### Dados

- TLS 1.2+; preferencialmente TLS 1.3.
- Criptografia em repouso.
- Envelope encryption para payloads fiscais.
- KMS/Vault para segredos.
- Rotação de chaves e credenciais.
- Hash SHA-256 para integridade dos payloads.
- mascaramento de CNPJ, e-mail e dados pessoais em logs.
- backups criptografados e testados.

### Aplicação

- validação positiva de entrada;
- consultas parametrizadas;
- ORM sem SQL inseguro;
- RLS;
- autorização em toda operação;
- CSRF em sessão cookie;
- cookies `Secure`, `HttpOnly`, `SameSite`;
- CSP e demais headers;
- rate limits;
- proteção contra enumeração;
- lockout adaptativo;
- sessões revogáveis;
- dependências e imagens escaneadas;
- SBOM;
- SAST, DAST e secret scanning.

### APIs técnicas

- OAuth 2.0 client credentials;
- audience específica;
- token curto;
- rotação de client secret;
- scopes mínimos;
- mTLS para clientes de maior criticidade;
- idempotência;
- replay protection;
- allowlist opcional de IP.

### Operação

- segregação de funções;
- produção sem acesso direto de desenvolvedor;
- break-glass;
- suporte com impersonation auditada;
- SIEM;
- alertas para exfiltração e acesso em massa;
- pentest periódico;
- plano de resposta a incidentes;
- restauração testada.

## MFA

Para administradores da plataforma, MFA obrigatório sem possibilidade de desativação por tenant. Preferir WebAuthn/passkey e manter TOTP como fallback.

## Segredos

Nunca retornar `client_secret` após criação. Mostrar apenas identificador, últimos caracteres quando aplicável, validade e data da última rotação.
