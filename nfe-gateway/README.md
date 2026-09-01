# nfe-gateway

Serviço de mensageria fiscal (SEFAZ/NF-e), baseado em [PyNFe](https://github.com/TadaSoftware/PyNFe), ligado ao `backend` (Go) por RabbitMQ e por duas APIs HTTP. Desenho completo em [`backend/docs/architecture/22_nfe_gateway_service.md`](../backend/docs/architecture/22_nfe_gateway_service.md) — leia isso primeiro.

## O que já funciona (verificado ao vivo, não só compilado)

- **RabbitMQ real** entre os dois processos (`internal/platform/broker/rabbitmq.go` no backend).
- **Migrations aplicadas**: `organization_company_nfe_distribution_state`/`_polls`, `nfe_gateway_inbox_events`, `nfe_gateway_organization_credentials`.
- **Certificado**: `POST /internal/v1/companies/{id}/certificates/signing-material` (backend, porta própria) entrega o PFX sempre sem senha, Key Vault ou store local cifrado.
- **Outbound**: `MessagingProvider` (Go) publica, `Worker.HandleTransmissionResult` (Go) consome a resposta — round trip completo testado contra Postgres+RabbitMQ reais.
- **Rate limit da distribuição por NSU**: `distribution_state.py` implementa o limite real da SEFAZ (20 consultas/hora, piso de 1h após `cStat 137`, reset de janela em `656` — ver o docstring do módulo), 19 testes.
- **Autenticação do inbound**: `POST /v1/inbound/fiscal_documents/nfe` usa OAuth2 client-credentials de verdade (um `organization_api_client` por organização, `oauth.py`/`credentials.py`), testado ao vivo ponta a ponta (token emitido, cacheado, aceito pelo `inbound_api`, chegou até a validação de negócio).

## O que ainda falta

Só uma coisa bloqueia o fluxo real contra SEFAZ: **`sefaz/client.py`** — `consult_distribution()` e `transmit_nfe()` levantam `NotImplementedError`. Os métodos reais do PyNFe já foram identificados e documentados no docstring do arquivo (`ComunicacaoSefaz.consulta_distribuicao`/`autorizacao`), falta só um certificado de homologação real pra validar a chamada exata.

## Provisionamento (por organização, uma vez)

O gateway autentica no `inbound_api` como um `organization_api_client` normal — não existe atalho multi-tenant. Por organização que ativar distribuição/inbound automático:

```bash
# 1. Cria o client técnico (admin, via control_plane_api) — o client_secret
#    só aparece nesta resposta, uma vez.
curl -X POST http://localhost:4000/v1/organizations/{organization_id}/api_clients \
  -H "Authorization: Bearer <token de admin>" -H "Content-Type: application/json" \
  -d '{"name":"nfe-gateway distribution","source_system":"nfe_gateway_distribution","scopes":["fiscal_documents:inbound:create"]}'

# 2. Guarda esse client_secret aqui, cifrado com NFE_GATEWAY_CREDENTIALS_KEY.
#    Pede o segredo interativamente (getpass) — nunca passar por --flag, fica
#    visível em `ps`/Task Manager e no histórico do shell.
python -m nfe_gateway.provision_credentials \
  --organization-id <uuid> --client-id <client_id>
```

## Rodando os testes (não precisa de Postgres/RabbitMQ/SEFAZ)

```bash
pip install -e ".[dev]"
pytest
```

## Setup local

```bash
cp .env.example .env   # preencher NFE_GATEWAY_SERVICE_TOKEN e NFE_GATEWAY_CREDENTIALS_KEY
pip install -e ".[dev]"
python -m nfe_gateway.workers.distribution_poller
python -m nfe_gateway.workers.outbound_consumer
```
