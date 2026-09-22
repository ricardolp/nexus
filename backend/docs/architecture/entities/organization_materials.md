# Organization materials (Dados Mestres)

Catálogo de materiais da organização, com de-para de unidades de medida no estilo SAP (MM02 — Units of measure). Migration `049`.

## `organization_materials`

Uma linha por `material_code` (código SAP resolvido quando existir; senão o `cProd` do XML).

- Preenchido automaticamente por trigger em `organization_nfe_items` (insert/update de código, descrição, UM, NCM)
- Também cadastrável manualmente (`source=manual`)
- `base_unit` é a UMB (unidade base)

API: `GET/POST /v1/organizations/{org}/materials`, `GET/PATCH .../materials/{id}` (`nfe:read` / `nfe_inbound:read` / `company:manage` para leitura; `nfe_inbound:manage` / `company:manage` para escrita).

`GET .../materials?code=` resolve pelo código SAP ou pelo código do fornecedor.

## `organization_material_uoms`

De/para por material: **X** `alternative_unit` **<=>** **Y** `base_unit`.

Exemplo (igual à tela SAP):

| X | UMA | <=> | Y | UMB |
|---|-----|-----|---|-----|
| 1 | EA | <=> | 1 | EA |
| 1 | UN | <=> | 1 | EA |
| 1,90 | KG | <=> | 1 | EA |

API: `POST/PATCH/DELETE .../materials/{id}/uoms/{uom_id}`

Conversão: `qty_base = qty_alt * (Y / X)`.

## Unidade alternativa na nota

`organization_nfe_items.alternative_unit` / `alternative_quantity` — overlay usado no posting SAP sem alterar o XML.

`PATCH .../fiscal_documents/{id}/items/{item_id}/alternative_unit` `{ "unit": "EA" }` calcula a quantidade a partir do cadastro do material.
