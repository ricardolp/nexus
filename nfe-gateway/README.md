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
- IBS/CBS (reforma tributária, NT 2025.002-RTC v1.50) montado pelo gateway em `sefaz/ibscbs_nfe.py`, guiado por `sefaz/data/cst_ibscbs.json` (CST/cClassTrib → gIBSCBS, gRed, gDif, gDevTrib, gTribRegular, gTribCompraGov, gIBSCBSMono Ad Rem/Ad Valorem por ano, gTransfCred, gAjusteCompet, gCredPresIBSZFM, gEstornoCred, gCredPresOper) e `IBSCBSTot` com gMono/gEstornoCred; confere vBC × alíquota = valor antes de transmitir
- Documentos referenciados (`sefaz/referencias_nfe.py`): `NFref` (refNFe/refCTe/refNF), `DFeReferenciado` por item (devolução VC02-14, corte configurável), `gCompraGov` e `gPagAntecipado`
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
| protocol | `python -m nfe_gateway.workers.protocol_consumer` | ConsultaProtocolo sob demanda |
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

EPEC e DANFE PDF ficam fora desta onda (não estavam em produção no legado).

## Reforma Tributária — NFS-e

- `nfse/dps.py` emite `IBSCBS` (finNFSe, indFinal, cIndOp, indDest, CST e cClassTrib em `trib/gIBSCBS`) quando o SAP ou o catálogo informa a classificação. A SefinNacional 1.6.0 ainda não aceita `indDest` depois do tomador. Competência a partir de 01/10/2026 sem o grupo é E0855.
- `indicador_destinatario=1` exige o objeto `destinatario` (grupo `dest`).
- `nfse/retorno.py` lê o IBS/CBS calculado pela SEFIN (`infNFSe/IBSCBS`) e o resultado da transmissão leva `ibscbs`; o backend persiste em `organization_nfse` e devolve no webhook (`ibs_cbs`).

Detalhes, contrato SAP e datas: `backend/docs/architecture/24_reforma_tributaria.md`.

## NFS-e — provedores municipais

NFS-e não vai mais só para a SEFIN Nacional: o Go escolhe o provedor pelo município do prestador (`nfse_municipal_providers` + settings da empresa) e manda `nfse_provider` / `nfse_provider_config` no `transmission_requested` e no `cancel_requested`. O gateway só despacha:

| Código | Pacote | Município(s) | Transporte |
|---|---|---|---|
| `sefin_nacional` (default) | `nfse/providers/sefin_nacional.py` | conveniados ao Sistema Nacional | DPS assinada + mTLS A1 |
| `ipm` | `nfse/providers/ipm/` | Garuva/SC e demais Atende.Net | XML IPM, multipart + Basic Auth (usuário/senha via `internal_api`), assinatura opcional |

- Todo provedor lê o **mesmo JSON canônico** (contrato Focus/SAP) e devolve o **mesmo resultado canônico** (`nfse/providers/base.py`).
- IPM não tem homologação: em `homologation` o XML vai com `<nfse_teste>1` e o resultado é `rejected` / `homologacao_validada` quando a prefeitura valida — nunca `authorized`.
- PDF oficial do provedor (`link_nfse`) é baixado e gravado em `{payload}.provider_pdf.pdf`; o download de DANFSe do backend usa esse PDF.
- Código TOM (IPM) a partir do IBGE: `nfse/providers/data/ibge_tom.json`.

Plugar um sistema novo: `nfse/providers/<codigo>/` (mapper, client, retorno, classe com `capabilities`/`emit`/`cancel`) + `registry.py` + descritor em `backend/internal/nfseprovider/descriptors.go` + linha no catálogo. Desenho completo: `backend/docs/architecture/25_nfse_provedores_municipais.md`.

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
python -m nfe_gateway.workers.protocol_consumer
python -m nfe_gateway.workers.status_monitor
```
