# NF-e XSD Schemas

This folder should contain the official NF-e XSD schemas from SEFAZ for full validation.

## Optional Setup

To enable full XSD validation before transmission:

1. Download the official NF-e schemas from SEFAZ:
   https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/Schemas

2. Extract and place `leiauteNFe_v4.00.xsd` (and its dependencies) in this folder

3. The validation helper (`xsd_validate.py`) will automatically use them if present

## Current Behavior

Without XSD files:
- Basic structural validation only (checks required elements are present)
- XML well-formedness validation via lxml parse
- Signature presence check after signing

With XSD files:
- Full schema compliance validation against official SEFAZ schemas
- Catches field format/type/length violations before transmission
