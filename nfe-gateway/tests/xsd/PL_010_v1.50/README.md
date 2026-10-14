# Schemas NF-e PL_010 (NT 2025.002-RTC v1.50) — somente para testes

Cópia dos XSD oficiais do pacote PL_010 (leiaute 4.00 + DFeTiposBasicos da
Reforma Tributária), obtidos do repositório nfephp-org/sped-nfe
(`schemes/PL_010_V1.30`, commit 346c14d, atualizado para a NT 2025.002 v1.50).

Usados pelos testes para validar `IBSCBS`, `IBSCBSTot`, `NFref`,
`gCompraGov`, `gPagAntecipado` e `DFeReferenciado`. Não ficam em
`src/nfe_gateway/sefaz/xsd/` de propósito: lá a validação roda antes de cada
transmissão e bloquearia emissões por divergências antigas fora da reforma.
Ao atualizar, baixe o pacote vigente no Portal NF-e.

`rtc_fragmentos.xsd` é um wrapper de teste (não oficial).
