# Auditoria fiscal das notas de saída autorizadas em homologação (14/10/2026)

Auditoria somente leitura. Cada nota foi verificada contra três fontes:

1. o JSON que o SAP enviou;
2. o que o Nexus gravou no Postgres;
3. o XML autorizado pela SEFAZ ou pela SEFIN.

O erro de desconto em NFS-e, já corrigido, ficou de fora: os casos encontrados aparecem como **EXCLUIDO** e não contam como falha.

- **Base:** Railway, projeto `nexus`, ambiente `production` (é o QAS: `qas.api.nexus...`), apenas documentos com `organization_documents.environment = 'homologation'` e `direction = 'outbound'`.
- **Escopo:** documentos com status `authorized`, `cancelled` ou `correction_registered`. Para documentos reenviados, foi usada sempre a versão mais recente do payload.
- **Arquivos por nota (CSV, separador `;`):**
  - [auditoria_homologacao_2026-10-14_nfe.csv](auditoria_homologacao_2026-10-14_nfe.csv): 1.693 verificações em 33 NF-e;
  - [auditoria_homologacao_2026-10-14_nfse.csv](auditoria_homologacao_2026-10-14_nfse.csv): 14.177 verificações em 606 NFS-e.

## 1. Resumo

| Tipo | Autorizadas | Canceladas | Emitentes | Período |
|---|---|---|---|---|
| NF-e (mod. 55) | 32 | 1 (34191) | Cerrado Pneus Filial (BA, 31), Cerrado Pneus Recapadora (BA, 1), LSMB Garuva (SC, 1) | 08/09 a 09/10 |
| NFS-e nacional | 603 | 3 | Cerrado Pneus 05523987000223 (601), Cerrado Pneus 05523987000657 (2), R L Pinheiro TI (3, Simples) | 06/09 a 13/10 (575 em 02/10) |

O que está correto em todas as notas:
- **NF-e:**
  - autorização (cStat 100, protocolo e chave iguais ao banco);
  - DV e composição da chave, `tpAmb=2` e `xNome` de homologação;
  - CRT × CST, CFOP × `idDest` e alíquota interestadual;
  - cálculos de ICMS, ICMS-ST, PIS, COFINS e IBS/CBS por item;
  - totais `ICMSTot` e `IBSCBSTot` iguais à soma dos itens;
  - alíquotas de teste de 2026 (IBS UF 0,1%, IBS Mun 0%, CBS 0,9%);
  - grupo `comb` (ANP) nos CFOP de combustível/lubrificante;
  - `infRespTec` em todas as notas, exceto a primeira (69342).
- **NFS-e:**
  - cStat 100, chave de 50 dígitos e ambiente 2;
  - cTribNac coerente com o item da LC 116;
  - município de incidência;
  - ISS (vBC × alíquota = vISSQN, alíquota de 2,5% dentro do intervalo de 2% a 5%);
  - vLiq, opSimpNac, CST PIS/COFINS, vPis e vCofins iguais ao SAP;
  - IBS/CBS calculado pela SEFIN, com base = vServ − ISS − PIS − COFINS e alíquotas de teste corretas.

O que precisa de correção está nas seções 2 e 3. A seção 4 mostra a origem de cada problema no código.

## 2. Achados NF-e

Severidade:
- **Alta:** dado obrigatório ou com efeito fiscal ausente ou divergente.
- **Média:** obrigação acessória ou divergência com o SAP.
- **Baixa:** informativo.

| # | Sev. | Achado | Notas | Origem | Base legal / referência |
|---|---|---|---|---|---|
| E1 | Alta | **CEST enviado pelo SAP não vai para o XML.** Mercadorias com ST (pneus, lubrificantes e autopeças com CST 60) ficam sem `CEST`. | 34160, 34176, 34177, 34178, 34184 (6 itens) | Gateway / PyNFe | Conv. ICMS 142/18, cl. 3ª: CEST obrigatório em operações com mercadoria sujeita a ST. A SEFAZ pode passar a rejeitar (cStat 806). |
| E2 | Alta | **NFref ausente em vendas para entrega futura (CFOP 5117).** O SAP enviou a chave da NF de simples faturamento (5922) e ela não foi para `ide/NFref`. | 34180, 34182, 34186 | Gateway (as notas são de 06/10; o código local de `referencias_nfe.py` já monta o NFref; confirmar se está implantado) | Conv. s/nº de 1970, art. 41 (entrega futura); RICMS-BA. A nota de remessa deve referenciar a de faturamento. |
| E3 | Alta / Média | **Grupo IPI omitido.** Com CST IPI 99 e valores zerados, o PyNFe não gera `<IPI>`. Na 69342, CST 51 (alíquota zero) também ficou sem o grupo. | 69342 (1 item), 34180, 34182, 34186 (4 itens) | Gateway / PyNFe | MOC NF-e: grupo IPI obrigatório para contribuinte do IPI. É alta na 69342, porque a LSMB é industrial, e média nas revendas da Cerrado. |
| E4 | Alta | **Frete de R$ 4.703,00 perdido.** O SAP mandou `valor_frete` no item e no total. O XML saiu com `vFrete=0` e `vNF=194.408,83`, mas a base de ICMS (199.111,83) e a base de IBS/CBS incluem o frete. A nota autorizada está internamente inconsistente (vBC maior que vProd + frete) e o valor total ficou menor que o do pedido. | 69342 | Gateway (nota de 08/09, primeira emissão) | Leiaute NF-e, regras de vNF e vBC; RICMS. O frete cobrado do destinatário integra a base e o total. |
| E5 | Alta | **Rastro (lote) ausente.** O SAP enviou o lote `2063010011` e o XML não tem `<rastro>`. | 69342 | Gateway (não mapeado) | NT 2016.002: `rastro` obrigatório para produtos sujeitos a rastreabilidade (por exemplo, NCM em lista ANVISA/MAPA). Para trator 8701.93 é recomendável, não obrigatório. |
| E6 | Alta | **infRespTec ausente.** | 69342 | Gateway (corrigido depois: as notas seguintes têm o grupo) | NT 2018.005 |
| E7 | Alta | **PIS/COFINS CST 01 (tributável) com base e valor zero** no item "cubo roda". | 34184 | SAP (enviou CST 01 sem base) | Coerência CST × valores (Lei 10.637/02 e Lei 10.833/03) |
| E8 | Média | **modFrete diferente do SAP.** O SAP enviou 9 (sem frete) e o XML saiu com 0 (por conta do emitente). O gateway preenche `nf.modalidade_frete`, mas o PyNFe lê `transporte_modalidade_frete`, então o valor é sempre o padrão 0. | 17 notas (34160 a 34174, 34190, 34191) | Gateway | Leiaute NF-e, `transp/modFrete` |
| E9 | Média | **dhEmi/dhSaiEnt com `+00:00`.** O SAP mandou `12:00-03:00` e o XML gravou `12:00+00:00`, ou seja, 09:00 no horário de Brasília. | 69342, 34160 | Gateway (corrigido: as demais estão com `-03:00`) | Leiaute NF-e: data e hora com o fuso local |
| E10 | Média | **nFCI ausente** em venda interestadual de mercadoria com origem 5 (conteúdo de importação de até 40%). | 34161, 34188, 34189 | SAP (não enviou `numero_fci`) | Conv. ICMS 38/13 e Res. SF 13/12 |
| E11 | Média | **vTotTrib ausente em venda a consumidor final.** | 34180, 34182 (CFOP 5117) e 74738 | SAP (`valor_total_tributos` = 0) | Lei 12.741/12 |
| E12 | Média | **EXTIPI, infAdProd e volumes do SAP não foram para o XML.** | 69342 (EXTIPI 001, infAdProd, volume 3.320 kg), 74738 (volumes) | Gateway | Leiaute NF-e (EXTIPI obrigatório quando houver ex-tarifário) |
| E13 | Média | **Base de IBS/CBS inclui o frete que não está no XML.** É consequência do E4. | 69342 | Gateway | LC 214/25, art. 12 |
| E14 | Baixa | **`cobr/fat` com vOrig, vDesc e vLiq iguais a 0,00.** O SAP manda `numero_fatura` sem valores. | 32 notas | SAP / Gateway | Leiaute NF-e (grupo opcional; omitir quando não houver valores) |
| E15 | Baixa | **ICMS60 a consumidor final com vBCSTRet, pST e vICMSSTRet = 0,00.** | 12 itens | SAP | NT 2016.002 (preencher os valores retidos anteriormente quando disponíveis) |
| E16 | Baixa | **xPed (pedido de compra) do SAP não foi para o XML.** O gateway não mapeia `pedido_compra` para `numero_pedido` do PyNFe. | 74738 | Gateway | Leiaute NF-e (opcional) |
| E17 | Baixa | **`tPag=90` (sem pagamento) em venda normal (finNFe 1)** com valor de R$ 194 mil. | 69342, 74738 | SAP | NT 2020.006 (90 só quando não há pagamento) |

Para a área fiscal validar (não é falha automática): itens de **lubrificante (NCM 2710.19.32)** e **autopeças (8708.70.90, 8716.90.90)** saíram com PIS/COFINS CST 01 (1,65% e 7,6%). Os pneus estão corretos com CST 04 monofásico. Confirmar se esses NCM estão no regime monofásico (Lei 10.485/02, Anexos I e II, e legislação de combustíveis/lubrificantes). Se estiverem, a revenda deveria sair com CST 04.

Não se aplica: não houve operação interestadual para não contribuinte (DIFAL/ICMSUFDest), desoneração, FCP próprio nem IPI tributado.

## 3. Achados NFS-e

| # | Sev. | Achado | Notas | Origem | Base legal / referência |
|---|---|---|---|---|---|
| S1 | Alta | **Total aproximado de tributos = 100% do valor do serviço.** O SAP envia `percentual_total_tributos_fed/mun` como a *divisão* do imposto entre esferas (por exemplo, 78,72% + 21,28% = 100%). O gateway aplicou esses percentuais sobre `vServ`. Exemplo: serviço de R$ 280,00 com `vTotTribFed` de R$ 220,42 e `vTotTribMun` de R$ 59,58. A informação ao consumidor está errada em todas as notas de não optante. | 603 (todas as da Cerrado) | SAP (semântica do campo) e gateway | Lei 12.741/12 e Dec. 8.264/14. O valor deve ser a carga aproximada (por exemplo, a tabela IBPT), não o preço. O código local de `nfse/dps.py` já trata a soma igual a 100 usando os valores destacados na nota (PIS + COFINS e ISS); confirmar se está implantado. |
| S2 | Alta | **PIS/COFINS do SAP incoerentes com base × alíquota.** A nota reproduz o que o SAP envia, mas em 403 de 603 notas `valor_pis ≠ base_calculo_pis_cofins × aliquota_pis` (razão entre 0 e 1,1). Exemplo: NFS-e 43 com base de R$ 98,00 a 1,65% (deveria dar R$ 1,62), mas vPis de R$ 0,79. | 403 (02/10 a 09/10) | SAP (provavelmente massa de teste gerada; 575 notas em 02/10) | Lei 10.637/02 e Lei 10.833/03. Validar o cálculo no SAP antes da produção. |
| S3 | Alta | **ISS do SAP diferente do apurado pela SEFIN** (diferenças de R$ 0,02). A SEFIN está certa (vBC × 2,5%) e o SAP arredonda errado. | 125, 426, 465, 482, 517 | SAP | LC 116/03 |
| S4 | Alta | **Deduções não enviadas.** O SAP mandou `valor_deducoes` = 5,00 e a DPS não tem `vDedRed`. O ISS foi calculado sobre R$ 280,00, enquanto o SAP considerou R$ 265,00. | 635 | Gateway (não mapeado) | LC 116/03, art. 7º; leiaute DPS `vDedRed` |
| S5 | Média | **Grupo IBSCBS da DPS omitido.** O SAP mandou CST 000 e cClassTrib 000001 e a DPS saiu sem `IBSCBS`. Nessas notas a SEFIN não destacou IBS/CBS. O grupo só saiu em 6 notas (06/09, 07/09 e 09/10). | 25 notas: 1, 2, 617 a 633, 638 a 643 | Gateway (o flag `_EMIT_DPS_IBSCBS` foi alternado durante os testes; ver comentário de 13/10 em `dps.py`) | LC 214/25 e NT SE/CGNFS-e 004/2025 (opcional em 2026, obrigatório depois) |
| S6 | Média | **cNBS não informado.** O SAP só envia `codigo_nbs` em 19 notas. Sem NBS, a classificação do IBS/CBS fica incompleta. | 587 | SAP | NT SE/CGNFS-e 004/2025 (NBS necessário para IBS/CBS) |
| S7 | Média | **Base IBS/CBS calculada pelo SAP diferente da SEFIN.** O SAP desconta PIS/COFINS pela alíquota cheia de 9,25% em vez dos valores destacados. Exemplo: NFS-e 634 com base SAP de R$ 353,00 e base SEFIN de R$ 367,80. | 634, 635, 636 | SAP | LC 214/25, art. 12 e transição de 2026 |
| S8 | Baixa | **vBCPisCofins, pAliqPis e pAliqCofins enviados pelo SAP não vão para a DPS.** Só vão CST, vPis e vCofins. | 603 | Gateway | Leiaute DPS (campos opcionais) |
| S9 | Baixa | **Endereço do tomador omitido.** O gateway exige bairro para montar `end`, e o SAP não envia `bairro` (só em 3 notas). | 603 | SAP / Gateway | Leiaute DPS (opcional para tomador nacional) |
| S10 | n/a | **Retenções IR/INSS/CSLL:** o gateway não mapeia `vRetIRRF`, `vRetCP` e `vRetCSLL`. Em homologação o SAP **nunca** enviou essas retenções, então não há nota afetada. A lacuna aparece assim que houver serviço com retenção. | 0 | Gateway (não mapeado) | Lei 9.430/96, Lei 10.833/03 (art. 30), Lei 8.212/91 (art. 31) |

Excluídos da contagem (erro de desconto já corrigido): NFS-e 640, 641, 642 e 643 (desconto incondicionado de R$ 10 a R$ 30 ausente na DPS, com o ISS do SAP diferente). A NFS-e 635 é do mesmo cenário: o SAP calculou o ISS sobre R$ 265,00 usando `valor_deducoes`, o que aparece no S4.

ME/EPP (R L Pinheiro, 3 notas): o ISS é apurado no DAS e a SEFIN não calcula vBC nem vISSQN. `regApTribSN` e `pTotTribSN` estão corretos.

## 4. Gravação no banco (Postgres) versus XML autorizado

| # | Achado | Notas |
|---|---|---|
| D1 | `organization_nfse.nfse_number` nunca é preenchido (o `nNFSe` existe só no XML). | 606 / 606 |
| D2 | `organization_nfe.total_ibs_base` e `total_icms_st` nunca são preenchidos. | 33 / 33 |
| D3 | IBS/CBS calculado pela SEFIN não é gravado (`cbs_amount`, `ibs_amount` e `ibs_cbs_calculation_base` nulos), apesar da migration 057. | 7 / 7 com IBSCBS |
| D4 | O banco guarda os valores do SAP, não os do documento autorizado. Exemplos: NF 69342 com `total_nf` 199.111,83 contra vNF 194.408,83 e `total_freight` 4.703 contra 0; `transport_modality` 9 contra modFrete 0 (17 notas); `iss_amount` do SAP diferente do vISSQN da SEFIN (10 NFS-e). As telas e os relatórios do Nexus mostram valores diferentes do documento fiscal. | 1 + 17 + 10 |
| D5 | O JSON original do SAP sumiu do bucket (`NoSuchKey`). | NFS-e doc `01a0791b-8326-7adb-947b-e5ba4d86bd34` |

## 5. Lacunas de código (origem dos achados)

| Achado | Arquivo | Causa |
|---|---|---|
| E1 CEST | `nfe-gateway/.venv/.../pynfe/processamento/serializacao.py` (linhas 288 e 304, comentadas) e [nfe-gateway/src/nfe_gateway/sefaz/sap_nfe.py](../../../nfe-gateway/src/nfe_gateway/sefaz/sap_nfe.py) (linha 437) | O gateway passa `cest` para o PyNFe, mas a serialização do CEST está comentada no PyNFe 0.6. É preciso um patch em `xml_patches.py`. |
| E12 EXTIPI | mesmo `sap_nfe.py` (linha 435) | O PyNFe não serializa `extipi`; precisa de patch. |
| E8 modFrete | `sap_nfe.py` (linha 154) | O gateway preenche `nf.modalidade_frete`, mas o PyNFe usa `nota_fiscal.transporte_modalidade_frete` (`serializacao.py`, linha 1695). |
| E3 IPI | `sap_nfe.py` (linha 499) e PyNFe `_serializar_imposto_ipi` | Para CST 00, 49, 50 ou 99 com valores zerados, o PyNFe não gera `<IPI>`. Gerar `IPITrib` com vBC, pIPI e vIPI = 0,00, ou omitir só quando o emitente não for contribuinte do IPI. |
| E5 rastro, E12 volumes, E16 xPed | `sap_nfe.py` | `rastros`, `volumes` e `pedido_compra` não são mapeados (o PyNFe usa `numero_pedido` para `xPed`). |
| E2 NFref | [nfe-gateway/src/nfe_gateway/sefaz/referencias_nfe.py](../../../nfe-gateway/src/nfe_gateway/sefaz/referencias_nfe.py) | O código local já monta `refNFe` a partir de `chave_nfe`, mas o arquivo ainda não está no git (*untracked*). Confirmar o deploy e reemitir um teste de 5117. |
| S1 vTotTrib | [nfe-gateway/src/nfe_gateway/nfse/dps.py](../../../nfe-gateway/src/nfe_gateway/nfse/dps.py) (`_nao_optante_totals`) | Corrigido localmente (a soma igual a 100 usa PIS + COFINS e ISS). Confirmar o deploy. O ideal é o SAP enviar a carga aproximada IBPT em percentual sobre o serviço. |
| S4 deduções, S8 base/alíquotas PIS/COFINS, S10 retenções | `nfse/dps.py` | `vDedRed`, `vBCPisCofins`, `pAliqPis`, `pAliqCofins`, `vRetIRRF`, `vRetCP` e `vRetCSLL` não são emitidos. |
| S5 IBSCBS | `nfse/dps.py` (`_EMIT_DPS_IBSCBS`) | O flag foi alternado; definir e travar o comportamento com teste. |
| D1 a D4 | `backend/internal/fiscal/sap_outbound_persist.go` e `sap_outbound_nfse_persist.go` | A gravação usa o payload do SAP; falta atualizar o banco com os valores do XML autorizado (nNFSe, IBS/CBS da SEFIN, totais da NF-e). |

## 6. Ações por responsável

- **SAP (dados de origem):**
  - definir a semântica de `percentual_total_tributos_*` (S1);
  - corrigir o cálculo de PIS/COFINS, do ISS e da base IBS/CBS (S2, S3, S7);
  - enviar `codigo_nbs` (S6), `numero_fci` em operação interestadual com origem 3, 5 ou 8 (E10), `valor_total_tributos` para consumidor final (E11), bairro do tomador (S9) e PIS/COFINS coerente com o CST (E7);
  - não enviar fatura zerada (E14).
- **Gateway (prioridade alta):**
  - patch de CEST e EXTIPI;
  - correção do `modFrete`;
  - emissão do IBS/CBS da DPS e mapeamento de `vDedRed`;
  - grupo IPI com CST tributado e valores zerados;
  - mapeamento de rastro, volumes e xPed;
  - mapeamento de retenções na NFS-e;
  - confirmar o deploy de `referencias_nfe.py` e do novo cálculo de `vTotTrib`.
- **Backend:** gravar o resultado do XML autorizado (D1 a D4) e investigar o objeto perdido no bucket (D5).
- **Área fiscal:** validar o regime monofásico de lubrificantes e autopeças (seção 2) e a obrigatoriedade de `rastro` para os produtos da LSMB.

## Apêndice A. Checklist por NF-e

O detalhe de cada verificação (OK, falha, não se aplica) está no CSV de NF-e.

| NF-e | Emitente | Status | UF | CFOP | Verificações | OK | Falhas (alta/média/baixa) | Falhas |
|---|---|---|---|---|---|---|---|---|
| 34160 | Cerrado Pneus Filial F | authorized | BA->BA | 5656 | 50 | 44 | 1/3/1 | [Item 1] CEST enviado pelo SAP presente no XML; dhEmi com fuso horario local do emitente; dhSaiEnt com fuso horario local; modFrete = SAP modalidade_frete; fat com valores zerados |
| 34161 | Cerrado Pneus Filial F | authorized | BA->GO | 6403 | 56 | 52 | 0/2/1 | [Item 1] nFCI em operacao interestadual com origem 3/5/8 (Conv. ICMS 38/13, Res. SF 13/12); modFrete = SAP modalidade_frete; fat com valores zerados |
| 34162 | Cerrado Pneus Filial F | authorized | BA->BA | 5405 | 49 | 45 | 0/1/2 | modFrete = SAP modalidade_frete; [Item 1] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34163 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34164 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34165 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34166 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34167 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34168 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34169 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34170 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34171 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34172 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34173 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34174 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 34175 | Cerrado Pneus Filial F | authorized | BA->BA | 5405 | 47 | 44 | 0/0/2 | [Item 1] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34176 | Cerrado Pneus Filial F | authorized | BA->BA | 5405 | 49 | 45 | 1/0/2 | [Item 1] CEST enviado pelo SAP presente no XML; [Item 1] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34177 | Cerrado Pneus Filial F | authorized | BA->BA | 5405,5656 | 69 | 63 | 1/0/3 | [Item 2] CEST enviado pelo SAP presente no XML; [Item 1] ICMS60 a consumidor final: valores retidos informados; [Item 2] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34178 | Cerrado Pneus Filial F | authorized | BA->BA | 5405,5656 | 88 | 80 | 1/0/4 | [Item 1] CEST enviado pelo SAP presente no XML; [Item 1] ICMS60 a consumidor final: valores retidos informados; [Item 2] ICMS60 a consumidor final: valores retidos informados; [Item 3] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34179 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 47 | 45 | 0/0/1 | fat com valores zerados |
| 34180 | Cerrado Pneus Filial F | authorized | BA->BA | 5117 | 41 | 36 | 2/1/2 | [Item 1] Grupo IPI enviado pelo SAP presente no XML; NFref (notas referenciadas do SAP) presente no XML; [Item 1] vTotTrib (Lei 12.741/12) em venda a consumidor final; [Item 1] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34181 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 66 | 63 | 0/0/1 | fat com valores zerados |
| 34182 | Cerrado Pneus Filial F | authorized | BA->BA | 5117 | 56 | 48 | 3/2/3 | [Item 1] Grupo IPI enviado pelo SAP presente no XML; [Item 2] Grupo IPI enviado pelo SAP presente no XML; NFref (notas referenciadas do SAP) presente no XML; [Item 1] vTotTrib (Lei 12.741/12) em venda a consumidor final; [Item 2] vTotTrib (Lei 12.741/12) em venda a consumidor final; [Item 1] ICMS60 a consumidor final: valores retidos informados; [Item 2] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34183 | Cerrado Pneus Filial F | authorized | BA->BA | 5405 | 47 | 45 | 0/0/1 | fat com valores zerados |
| 34184 | Cerrado Pneus Filial F | authorized | BA->BA | 5405,5656 | 70 | 63 | 4/0/1 | [Item 1] CEST enviado pelo SAP presente no XML; [Item 1] PIS CST 01 (tributavel) com valor zero; [Item 1] COFINS CST 01 (tributavel) com valor zero; [Item 2] CEST enviado pelo SAP presente no XML; fat com valores zerados |
| 34185 | Cerrado Pneus Filial F | authorized | BA->BA | 5922 | 46 | 44 | 0/0/1 | fat com valores zerados |
| 34186 | Cerrado Pneus Filial F | authorized | BA->BA | 5117 | 38 | 35 | 2/0/1 | [Item 1] Grupo IPI enviado pelo SAP presente no XML; NFref (notas referenciadas do SAP) presente no XML; fat com valores zerados |
| 34188 | Cerrado Pneus Filial F | authorized | BA->GO | 6403 | 47 | 44 | 0/1/1 | [Item 1] nFCI em operacao interestadual com origem 3/5/8 (Conv. ICMS 38/13, Res. SF 13/12); fat com valores zerados |
| 34189 | Cerrado Pneus Filial F | authorized | BA->GO | 6403 | 47 | 44 | 0/1/1 | [Item 1] nFCI em operacao interestadual com origem 3/5/8 (Conv. ICMS 38/13, Res. SF 13/12); fat com valores zerados |
| 34190 | Cerrado Pneus Filial F | authorized | BA->BA | 5405 | 48 | 44 | 0/1/2 | modFrete = SAP modalidade_frete; [Item 1] ICMS60 a consumidor final: valores retidos informados; fat com valores zerados |
| 34191 | Cerrado Pneus Filial F | cancelled | BA->BA | 5405 | 48 | 45 | 0/1/1 | modFrete = SAP modalidade_frete; fat com valores zerados |
| 69342 | LSMB - Garuva | authorized | SC->MG | 6101 | 52 | 38 | 7/6/1 | [Item 1] vFrete = SAP valor_frete; [Item 1] Grupo rastro (lote) enviado pelo SAP presente no XML; [Item 1] vBC ICMS = vProd + frete + seguro + outras - desconto (+IPI se consumidor final); [Item 1] Grupo IPI enviado pelo SAP presente no XML; vNF = SAP valor_total; vFrete = SAP valor_frete; infRespTec presente (NT 2018.005, obrigatorio); dhEmi com fuso horario local do emitente; dhSaiEnt com fuso horario local; [Item 1] EXTIPI enviado pelo SAP presente no XML; [Item 1] infAdProd enviado pelo SAP presente; [Item 1] vBC IBS/CBS = valor da operacao - ICMS - PIS - COFINS (LC 214/25 art. 12 e transicao); transp/vol (volumes do SAP) presente no XML; pag: tPag 90 (sem pagamento) em NF-e de finalidade normal |
| 74738 | Cerrado Pneus Recapadora | authorized | BA->BA | 1915 | 56 | 49 | 0/3/4 | [Item 1] vTotTrib (Lei 12.741/12) em venda a consumidor final; [Item 2] vTotTrib (Lei 12.741/12) em venda a consumidor final; transp/vol (volumes do SAP) presente no XML; [Item 1] xPed enviado pelo SAP presente no XML; [Item 2] xPed enviado pelo SAP presente no XML; fat com valores zerados; pag: tPag 90 (sem pagamento) em NF-e de finalidade normal |

## Apêndice B. Checklist NFS-e (consolidado por verificação)

O detalhe por nota está no CSV de NFS-e.

| Area | Verificacao | OK | Falha | N/A | Excluido (desconto) |
|---|---|---|---|---|---|
| Autorizacao | Ambiente de homologacao (tpAmb/ambGer = 2) | 606 | 0 | 0 | 0 |
| Autorizacao | Chave de acesso com 50 digitos | 606 | 0 | 0 | 0 |
| Autorizacao | cStat 100 (NFS-e gerada) | 606 | 0 | 0 | 0 |
| IBS/CBS (reforma) | Aliquotas teste 2026 (IBS UF 0,1% / Mun 0% / CBS 0,9%) | 7 | 0 | 0 | 0 |
| IBS/CBS (reforma) | CST/cClassTrib IBS/CBS = SAP | 6 | 0 | 0 | 0 |
| IBS/CBS (reforma) | Grupo IBSCBS da DPS (CST/cClassTrib enviados pelo SAP) | 0 | 25 | 0 | 0 |
| IBS/CBS (reforma) | vBC IBS/CBS = SAP ibs_cbs_base_calculo | 0 | 3 | 0 | 0 |
| IBS/CBS (reforma) | vBC IBS/CBS composicao | 7 | 0 | 0 | 0 |
| Identificacao | opSimpNac coerente com SAP (optante_simples_nacional/op_simp_nac) | 606 | 0 | 0 | 0 |
| Partes | Endereco do tomador enviado pelo SAP presente na DPS | 0 | 603 | 0 | 0 |
| Servico | Municipio de incidencia | 606 | 0 | 0 | 0 |
| Servico | cNBS = SAP codigo_nbs | 19 | 0 | 0 | 0 |
| Servico | cNBS informado (necessario para IBS/CBS - NT 004/2025) | 0 | 587 | 0 | 0 |
| Servico | cTribNac coerente com item LC 116 do SAP | 606 | 0 | 0 | 0 |
| Total aproximado de tributos (Lei 12.741) | ME/EPP: pTotTribSN | 3 | 0 | 0 | 0 |
| Total aproximado de tributos (Lei 12.741) | vTotTrib e aproximacao dos tributos (nao o valor do servico) | 0 | 603 | 0 | 0 |
| Tributos federais | Base PIS/COFINS = valor do servico - desconto incondicionado | 0 | 1 | 0 | 0 |
| Tributos federais | CST PIS/COFINS = SAP | 606 | 0 | 0 | 0 |
| Tributos federais | Retencoes IR/INSS/CSLL | 0 | 0 | 606 | 0 |
| Tributos federais | vBCPisCofins/pAliqPis/pAliqCofins enviados pelo SAP presentes na DPS | 0 | 603 | 0 | 0 |
| Tributos federais | vCOFINS = base x aliquota (SAP) | 0 | 403 | 0 | 0 |
| Tributos federais | vCofins = SAP | 606 | 0 | 0 | 0 |
| Tributos federais | vPIS = base x aliquota (SAP) | 0 | 403 | 0 | 0 |
| Tributos federais | vPis = SAP | 606 | 0 | 0 | 0 |
| Valores/ISSQN | Deducoes (vDedRed) = SAP valor_deducoes | 0 | 1 | 0 | 0 |
| Valores/ISSQN | Desconto (vDescCondIncond) = SAP | 0 | 0 | 0 | 4 |
| Valores/ISSQN | ISSQN apurado no DAS (ME/EPP Simples Nacional) | 0 | 0 | 3 | 0 |
| Valores/ISSQN | pAliqAplic = SAP aliquota | 603 | 0 | 0 | 0 |
| Valores/ISSQN | tpRetISSQN coerente com SAP iss_retido | 606 | 0 | 0 | 0 |
| Valores/ISSQN | tribISSQN coerente com natureza_operacao | 606 | 0 | 0 | 0 |
| Valores/ISSQN | vBC ISSQN = vServ - vDescIncond - vDedRed | 603 | 0 | 0 | 0 |
| Valores/ISSQN | vISSQN = SAP valor_iss | 593 | 6 | 0 | 4 |
| Valores/ISSQN | vISSQN = vBC x pAliqAplic | 603 | 0 | 0 | 0 |
| Valores/ISSQN | vLiq = vServ - descontos - retencoes | 606 | 0 | 0 | 0 |
| Valores/ISSQN | vServ = SAP valor_servicos | 606 | 0 | 0 | 0 |

## Apêndice C. Método

- Os XMLs e JSONs foram baixados do bucket `fiscal-objects` e descriptografados (AES-256-GCM) só localmente. A versão usada foi a mais recente de cada `payload_type`, o que importa para notas reenviadas, como a NF 34160, autorizada na 3ª versão.
- **Tolerâncias:** R$ 0,01 por item e R$ 0,05 nos totais.
- **Regras automáticas da NF-e:**
  - autorização, chave e identificação;
  - destinatário;
  - CFOP;
  - ICMS (base, valor, alíquota interestadual por origem e UF), ST, ICMS60, FCP, DIFAL e desoneração;
  - IPI, PIS e COFINS;
  - IBS/CBS (alíquotas de 2026, base e totais);
  - totais e fórmula do vNF;
  - pagamento e fatura, NFref, volumes, rastro, CEST, nFCI, EXTIPI, xPed e infRespTec.
- **Regras automáticas da NFS-e:**
  - autorização;
  - opSimpNac;
  - cTribNac × LC 116, cNBS e municípios;
  - ISS (base, alíquota de 2% a 5%, valor, retenção);
  - PIS/COFINS;
  - retenções e vLiq;
  - totTrib (Lei 12.741);
  - IBS/CBS (grupo, base, alíquotas);
  - tomador.
