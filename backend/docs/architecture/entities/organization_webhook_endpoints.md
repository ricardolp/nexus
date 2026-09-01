# `organization_webhook_endpoints`

Destino HTTP para eventos enviados pelo SaaS.

## Regras

- assinatura HMAC;
- rotação de segredo;
- retries e dead-letter;
- URL protegida contra SSRF;
- endpoint pode ser escopado por empresa.
