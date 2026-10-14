# 24 — Reforma Tributária (IBS/CBS) na NF-e e na NFS-e

Estado em 07/10/2026. Referências: NT 2025.002-RTC v1.50–v1.52 (NF-e), NTs 004–009
SE/CGNFS-e (NFS-e Nacional), Ato Conjunto RFB/CGIBS nº 4/2026 e Ato Técnico Conjunto nº 1/2026.

## Prazos que afetam o código

| Documento | Situação |
|---|---|
| NF-e (regime regular) | IBS/CBS obrigatório desde 03/08/2026; rejeição por **ausência** suspensa; validações de conteúdo (CST × grupo, alíquotas, redução, diferimento) em produção desde 05/10/2026 |
| NF-e devolução por item (VC02-14) | homologação 26/10/2026, produção 16/11/2026 (comunicado ENCAT de 05/10/2026) |
| NF-e monofásico reformulado (v1.50) | produção 03/11/2026 |
| NFS-e (regime regular, ISS) | grupo IBSCBS obrigatório desde 01/10/2026; sem rejeição até 31/12/2026 |
| Simples Nacional | 01/01/2027 |

Confirme as datas no Portal NF-e e no portal da NFS-e antes de cada virada.

## NFS-e

### Quem calcula o quê

A DPS leva `IBSCBS/finNFSe, indFinal, cIndOp, indDest, dest?, valores/trib/gIBSCBS(CST, cClassTrib)`.
O Anexo VI v1.04.01 coloca `indDest` depois do tomador, mas a SefinNacional 1.6.0 ainda espera `interm` ou `serv` nesse ponto e rejeita o elemento. `indDest` fica dentro de `IBSCBS`.
Em 13/10/2026 a mesma versão rejeita a DPS sem o grupo quando `dCompet` é igual ou posterior a 01/10/2026 (E0855). Omitir `cIndOp` responde HTTP 500 E999. O CST 000 tem `IndExigeTrib`, então o indicador continua na DPS. Com ele, a SEFIN devolve E0859: a consulta da calculadora não acusa indicação de IBS/CBS para CST 000 / cClassTrib 000001, embora a tabela SVRS marque `IndExigeTrib`.
A NT 009 v1.01 coloca `CST` e `cClassTrib` como filhos diretos de `trib`. A homologação oscilou no mesmo dia: às 14:20 rejeitou `gIBSCBS` e exigiu `CST`; às 19:20 rejeitou `CST` e exigiu `gIBSCBS`. A DPS segue o schema das 19:20 (`trib/gIBSCBS/CST`, `trib/gIBSCBS/cClassTrib`).
Base, alíquotas e valores são calculados pela SEFIN Nacional e devolvidos em `infNFSe/IBSCBS`
(`valores` + `totCIBS`). Sem o grupo na DPS a SEFIN não calcula nada.

### Entrada (DPS) — `nfe-gateway/src/nfe_gateway/nfse/dps.py`

1. CST e cClassTrib vêm do SAP (`servico.ibs_cbs_situacao_tributaria`, `servico.ibs_cbs_classificacao_tributaria`).
   Se o SAP não manda, o backend completa a partir do **catálogo de serviços NFS-e da empresa**
   (`organization_company_nfse_services.ibs_cbs_cst / ibs_cbs_class_trib / ibs_cbs_operation_indicator`,
   match por item LC 116 e/ou NBS) antes de publicar para o gateway (`fiscal/nfse_ibscbs.go`).
   O que o SAP envia sempre prevalece.
2. `cIndOp` (Anexo VII): SAP → catálogo → `nfse/data/cindop_rules.json`.
   Com CST/cClassTrib e sem cIndOp a DPS é recusada no gateway: a SEFIN responde E999.
3. Validações locais: CST 3 dígitos, cClassTrib 6 dígitos começando pelo CST, cIndOp 6 dígitos
   quando informado, CST e cClassTrib juntos.
4. `indicador_destinatario=1` (destinatário ≠ tomador) exige o objeto `destinatario`
   (`cnpj|cpf|nif`, `razao_social`, `endereco`, `telefone`, `email`) → grupo `dest`.
   Se o SAP usa `1` com outro sentido, envie `0`.

API do catálogo (`PUT/POST .../nfse_services`): campos novos `ibs_cbs_cst`, `ibs_cbs_class_trib`,
`ibs_cbs_operation_indicator`. Campo omitido no PUT mantém o valor gravado; string vazia limpa.

### Saída (NFS-e autorizada)

- `nfse/retorno.py` extrai `infNFSe/IBSCBS` e o resultado da transmissão leva `ibscbs`.
- `fiscal.ApplyTransmissionResult` grava em `organization_nfse`:
  `ibs_cbs_calculation_base`, `ibs_uf_amount`, `ibs_mun_amount`, `ibs_amount`, `cbs_amount`,
  `*_rate_pct` / `*_effective_rate_pct` (percentual, como a SEFIN imprime),
  `ibs_cbs_incidence_municipality_*`, `ibs_cbs_operation_indicator`, `total_with_ibs_cbs`,
  `ibs_cbs_source = 'sefin'`, `ibs_cbs_calculated_at`, `ibs_cbs_sefin_json`.
  As colunas `ibs_uf_rate` / `ibs_mun_rate` / `cbs_rate` continuam com o que o SAP enviou.
- O evento de outbox (webhook / SAP) passa a ter `ibs_cbs`:
  `{fonte, cst, c_class_trib, c_ind_op, codigo_municipio_incidencia, base_calculo,
  ibs_uf_aliquota, ibs_uf_valor, ibs_mun_aliquota, ibs_mun_valor, ibs_valor, cbs_aliquota,
  cbs_valor, valor_total_com_ibs_cbs, ...}`.

Migration: `057_nfse_ibs_cbs_reforma.sql`.

## NF-e

O PyNFe não serializa mais IBS/CBS. O gateway monta `det/imposto/IBSCBS` (TTribNFe) e
`total/IBSCBSTot` (TIBSCBSMonoTot) em `sefaz/ibscbs_nfe.py`.

### Tabela CST → grupos

`sefaz/data/cst_ibscbs.json` espelha os indicadores da tabela oficial de CST/cClassTrib
(`obrigatorio` / `opcional` / ausente). `por_cclasstrib` permite exceções por cClassTrib.
Mantenha sincronizado com a tabela do portal (https://dfe-portal.svrs.rs.gov.br/DFE/TabelaClassificacaoTributaria).

| CST | Grupo principal | Extras |
|---|---|---|
| 000, 010, 220, 221, 222, 830 | gIBSCBS | — |
| 011 | gIBSCBS | gRed opcional |
| 200 | gIBSCBS | gRed obrigatório |
| 510 | gIBSCBS | gDif obrigatório |
| 515 | gIBSCBS | gDif + gRed obrigatórios |
| 550, 820 | gIBSCBS opcional | — |
| 400, 410 | nenhum | — |
| 620 | gIBSCBSMono | — |
| 800 / 810 / 811 | gTransfCred / gCredPresIBSZFM / gAjusteCompet | — |

Com gIBSCBS: gDevTrib, gTribRegular e gTribCompraGov saem quando o SAP manda valor.
Qualquer CST: gEstornoCred e gCredPresOper quando o SAP manda valor.

### Regras de conferência (antes de transmitir)

- Alíquotas em **percentual** (contrato SAP real: `IBS_UF_ALIQUOTA = 0.1`). A fixture antiga
  usava fração (0.001) e geraria `pIBSUF 0.0010` com `vIBSUF` de 0,1%.
- `vIBSUF/vIBSMun/vCBS = vBC × alíquota (efetiva) / 100`, tolerância R$ 0,01
  (não se aplica a 220/221, diferimento, devolução de tributo e compra governamental).
- `vIBS = vIBSUF + vIBSMun`.
- `pAliqEfet` calculada como `p × (1 − pRedAliq/100)` quando o SAP não envia.
- `vDif` calculado como `vBC × alíquota efetiva × pDif / 10000` quando o SAP não envia.
- cClassTrib ausente ou de outro CST → erro (antes virava `000001` em silêncio).

### Monofásico (CST 620, layout v1.50)

Regime por ano de emissão (RV UB85a-10): 2026 IBS e CBS Ad Valorem; 2027–2028 IBS Ad Valorem
e CBS Ad Rem; 2029+ ambos Ad Rem.

Campos SAP (item):

| XML | Ad Valorem | Ad Rem |
|---|---|---|
| gMonoPadrao | `mono_base_calculo_valor` (ou `ibs_cbs_base_calculo`), `mono_ibs_uf_aliquota`/`ibs_uf_aliquota`, `mono_ibs_uf_valor`/`ibs_uf_valor`, `mono_ibs_mun_*`/`ibs_mun_*`, `mono_ibs_valor`, `mono_cbs_aliquota`/`cbs_aliquota`, `mono_cbs_valor`/`cbs_valor` | `mono_base_calculo_quantidade_t`, `mono_ibs_aliquota_ad_rem`, `mono_cbs_aliquota_ad_rem`, `mono_ibs_valor`, `mono_cbs_valor` |
| gMonoReten | `mono_base_calculo_valor_reten` (novo), `mono_{ibs,cbs}_aliquota_retencao`, `mono_{ibs,cbs}_valor_retencao` | `mono_base_calculo_qtd_trib_ret`, idem |
| gMonoRet | `mono_{ibs,cbs}_valor_retido_ante` | idem |
| gpBioDiferenca (cClassTrib 620004/620005) | `mono_quantidade_bio_comb`, `mono_{ibs,cbs}_valor_diferenca` (novos) | idem |
| vTot{IBS,CBS}MonoItem | `mono_total_{ibs,cbs}_item` ou padrão + retenção | idem |

### Documentos referenciados — `sefaz/referencias_nfe.py`

- `notas_referenciadas[]` → `ide/NFref`: `chave_acesso` (refNFe; modelo 57/67 → refCTe) ou
  `uf, ano_mes, cnpj, modelo 01/02, serie, numero` (refNF). Modelo 04 e ECF não são suportados
  pelo contrato e geram erro.
- Item `chave_acesso_dfe_referenciado` + `numero_item_dfe_referenciado` → `det/DFeReferenciado`.
- Devolução (finNFe=4) a partir do corte da VC02-14: `refNFe` some do cabeçalho; cada item precisa
  da referência. Se o SAP não manda por item e há exatamente uma NF-e em `notas_referenciadas`,
  ela é usada em todos os itens (sem nItem); com várias NF-e, erro pedindo a referência por item.
  Corte ajustável sem deploy: `NFE_DEVOLUCAO_POR_ITEM_HOMOLOGACAO` / `NFE_DEVOLUCAO_POR_ITEM_PRODUCAO` (AAAA-MM-DD).
- `tipo_compra_governamental`, `tipo_operacao_governamental`, `perc_reducao_aliq_compra_gov`,
  `chaves_acesso_dfe_anteriores[]` → `ide/gCompraGov` (+ `gTribCompraGov` no item).
- `chaves_nfe_antecipacao_pagamento[]` → `ide/gPagAntecipado`.

### Testes

`nfe-gateway/tests/test_ibscbs_nfe.py` e `test_referencias_nfe.py` validam os grupos contra os
XSD oficiais do PL_010 (v1.50) em `nfe-gateway/tests/xsd/PL_010_v1.50/`, inclusive o payload
ABAP real normalizado (`tests/fixtures/sap_nfe_outbound_abap_real_normalized.json`).
Os XSD ficam fora de `sefaz/xsd/` para não bloquear emissões por divergências antigas fora da reforma.

## Pendências conhecidas

- Tabela `cst_ibscbs.json` e `cindop_rules.json` montadas a partir das NTs e do contrato; conferir
  com as tabelas oficiais vigentes (indicadores por cClassTrib e Anexo VIII da NFS-e).
- NFS-e: grupos `tpOper`, `gRefNFSe`, `tpEnteGov`, `imovel`, `gReeRepRes`, `gTribRegular`, `gDif`,
  `cCredPres`, `indZFMALC` e NT 009 (finNFSe 1/2, `gIBSCBSAjuste`, `vAjusteBC`, CNPJ alfanumérico).
- NF-e: `vItem`, `vNFTot`, `gALCZFMCBS`, Imposto Seletivo (2027), eventos da reforma (112xxx/211xxx).
- Notas recebidas: extrair IBS/CBS por item para crédito.
- Tela do catálogo de serviços NFS-e no frontend para os três campos novos.
