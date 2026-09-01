# `organizations`

Representa o tenant contratante.

## Regras

- isolamento obrigatório por `organization_id` nas entidades filhas;
- slug único;
- status controla acesso de todo o tenant;
- suspensão não deve apagar documentos nem histórico.
