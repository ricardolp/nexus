# `organization_nfse`

Extensão 1:1 de `organization_documents` para NFS-e (entrada e saída).

## Schema

Migration `001` criou o núcleo (`municipality_code`, `provider_code`, `rps_number`, `rps_series`, `verification_code`, `issued_at`, `metadata_json`).

Migration `037_nfse_outbound_relational.sql` alarga a tabela no padrão da NF-e (`034`): cabeçalho RPS, prestador/tomador/intermediário, endereço, serviço/ISS, reforma (IBS/CBS) e autorização SEFIN (`access_key`, `dps_id`, `nfse_number`, `authorization_*`, `authorized_at`). Colunas em inglês; o JSON de origem continua em português.

## Contrato de saída

O JSON de `POST /v1/fiscal_documents/nfse` (OAuth inbound_api) e de
`POST /v1/organizations/{org}/companies/{company}/fiscal_documents/nfse` (JWT control-plane, UI) é o payload aninhado que o sistema de origem (ou a tela Nexus) monta: `prestador`, `tomador`, `servico` (e opcionalmente `intermediario`). Não é flat como a NF-e SAP.

Tipos Go: `SAPNFSePayload` em `internal/fiscal/sap_outbound_nfse.go`. Persistência: `persistOutboundNFSe` após o insert base em `Receive`.

Campos obrigatórios na emissão: `data_emissao`, `natureza_operacao`, `serie_rps`/`numero_rps`, `prestador.cnpj`, município do prestador, tomador e serviço (valores, item da lista, discriminação, município da prestação).

O JSON original permanece em object storage (`original_request`).

## UI de emissão

Cadastro de tomadores da organização e atividades (CNAE + descrição) da empresa: ver [organization_customers.md](organization_customers.md). Fluxo: lista saída → selecionar cliente → emitir com atividade/CNAE da empresa; NBS é sugerido pelo CNAE e o código nacional (LC 116) pela correlação com o NBS (RPS também).

## Autorização (Portal Nacional)

Com `FISCAL_PROVIDER=messaging`, o worker publica `fiscal.document.transmission_requested.v1` com `document_type=nfse` e `municipality_code`. O `nfe-gateway` monta o DPS, assina com o A1 da empresa e POSTa no SEFIN Nacional. O resultado (`authorized` | `rejected` | `error` — SEFIN é síncrono, sem `waiting_recibo`) atualiza `organization_nfse` via `ApplyTransmissionResult`.
