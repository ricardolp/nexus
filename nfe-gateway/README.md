# nfe-gateway

Serviço de mensageria fiscal (SEFAZ/NF-e), baseado em [PyNFe](https://github.com/TadaSoftware/PyNFe), ligado ao `backend` (Go) por RabbitMQ e por duas APIs HTTP. Desenho completo em [`backend/docs/architecture/22_nfe_gateway_service.md`](../backend/docs/architecture/22_nfe_gateway_service.md) — leia isso primeiro.

## O que já funciona (verificado ao vivo, não só compilado)

- **RabbitMQ real** entre os dois processos (`internal/platform/broker/rabbitmq.go` no backend).
- **Migrations aplicadas**: `organization_company_nfe_distribution_state`/`_polls`, `nfe_gateway_inbox_events`, `nfe_gateway_organization_credentials`.
- **Certificado**: `POST /internal/v1/companies/{id}/certificates/signing-material` (backend, porta própria) entrega o PFX sempre sem senha, Key Vault ou store local cifrado.
- **Outbound NF-e**: `MessagingProvider` (Go) publica `fiscal.document.transmission_requested.v1` com SAP JSON, `outbound_consumer.py` mapeia para PyNFe, assina, valida XSD, transmite via `ComunicacaoSefaz.autorizacao`, faz polling de recibo se assíncrono (cStat 103), e publica `fiscal.document.transmission_result.v1` com chave de acesso/protocolo/erros. Round trip completo implementado.
- **Rate limit da distribuição por NSU**: `distribution_state.py` implementa o limite real da SEFAZ (20 consultas/hora, piso de 1h após `cStat 137`, reset de janela em `656` — ver o docstring do módulo), 19 testes.
- **Autenticação do inbound**: `POST /v1/inbound/fiscal_documents/nfe` usa OAuth2 client-credentials de verdade (um `organization_api_client` por organização, `oauth.py`/`credentials.py`), testado ao vivo ponta a ponta (token emitido, cacheado, aceito pelo `inbound_api`, chegou até a validação de negócio).

## Mapper SAP → PyNFe NF-e

O módulo `sefaz/sap_nfe.py` converte o JSON flat português do SAP (vide `backend/test/testdata/fiscal/sap_nfe_outbound.json`) em entidades PyNFe completas. Suporta:
- Campos obrigatórios de identificação (série, número, natureza, tipo documento, data emissão)
- `tipo_emissao` / chave pré-computada (dígito 35 → tpEmis) para contingência SVC-AN/RS
- Emitente e destinatário com endereços completos, `id_estrangeiro`, SUFRAMA/ISUF
- Itens com NCM, CFOP, quantidades, ICMS (incl. CST 51 diferimento), IPI, PIS, COFINS
- IBS/CBS (reforma tributária NT 2025.002) com cClassTrib, alíquotas UF/Mun, monofásico 620
- finNFe 5/6 (débito/crédito) + pós-processamento XML (`sefaz/xml_patches.py`)
- Injeção automática do disclaimer de homologação quando `homologacao=True`

## PyNFe pin

PyPI `0.6.5` **não** inclui a reforma. O gateway pina um SHA do GitHub `main`
(`requirements-pynfe.txt` / `pyproject.toml`). Transporte SOAP usa
`ComunicacaoSefazVerified` — TLS verify ON with `certifi-icpbr` (Mozilla + ICP-Brasil).
Does **not** use PyNFe's `verify=False`, and does **not** rely on Mozilla-only certifi
(that rejects SVRS/ICP-Brasil server chains).

## Workers

| Worker | Comando | Função |
|--------|---------|--------|
| outbound | `python -m nfe_gateway.workers.outbound_consumer` | autorização (+ recibo / contingência) |
| distribution | `python -m nfe_gateway.workers.distribution_poller` | NSU inbound |
| query | `python -m nfe_gateway.workers.query_worker` | consulta on-demand |
| manifestation | `python -m nfe_gateway.workers.manifestation_worker` | ciência |
| events | `python -m nfe_gateway.workers.event_consumer` | cancel / CC-e / inutilização |
| status | `python -m nfe_gateway.workers.status_monitor` | statusServico → `sefaz.status.changed.v1` |

## XSD Validation

O módulo `sefaz/xsd_validate.py` faz validação estrutural básica (elementos obrigatórios presentes) e, se os schemas oficiais SEFAZ estiverem em `sefaz/xsd/` (vide README naquela pasta), valida contra XSD completo antes da transmissão. Erros XSD são reportados como `error_code=xsd_validation` sem custo de chamada SEFAZ.

## Segurança

- PFX efêmero + shred; `TMPDIR` em tmpfs em produção
- Object store local com AES-256-GCM (`SECRETS_ENCRYPTION_KEY`, mesmo formato do Go)
- Logs sem XML/PFX/e-mail (`logging_safe.py`)
- Filas com dead-letter exchange
- `SEFAZ_FORCE_HOMOLOGACAO=true` por default
- `internal_api` Go: IP allowlist + TLS/mTLS opcional (`INTERNAL_API_TLS_*`)

## O que ainda falta

Distribuição inbound: **`sefaz/client.py`** — `consult_distribution()` está wired; validar com certificado de homologação real.

EPEC, DANFE PDF e NFS-e ficam fora desta onda (não estavam em produção no legado).

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
cp .env.example .env   # preencher NFE_GATEWAY_SERVICE_TOKEN, NFE_GATEWAY_CREDENTIALS_KEY, SECRETS_ENCRYPTION_KEY
pip install -e ".[dev]"
python -m nfe_gateway.workers.distribution_poller
python -m nfe_gateway.workers.outbound_consumer
python -m nfe_gateway.workers.event_consumer
python -m nfe_gateway.workers.status_monitor
```
