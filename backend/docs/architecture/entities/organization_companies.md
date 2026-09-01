# `organization_companies`

Empresas/CNPJs de uma organização.

## Regras

- CNPJ normalizado;
- unique por tenant;
- serviço fiscal é ativado em `organization_company_services`;
- ambiente de homologação e produção não compartilha segredo.
