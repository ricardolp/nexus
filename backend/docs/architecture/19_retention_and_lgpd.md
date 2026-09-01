# Retenção e LGPD

## Classificação

Classificar:

- dados cadastrais;
- dados pessoais;
- credenciais;
- payload fiscal;
- logs;
- auditoria;
- backups.

## Regras

- minimização;
- finalidade;
- acesso por necessidade;
- retenção configurada por categoria;
- legal hold;
- exclusão/anonymization quando permitido;
- trilha de acesso a payload sensível;
- exportação auditada;
- data residency por contrato;
- subprocessadores documentados.

## Retenção

Criar políticas globais com override contratual controlado.

Entidades:

- `retention_policies`
- `organization_retention_settings`
- `legal_holds`
- `retention_executions`

Não excluir documentos fiscais apenas porque o usuário foi removido.

## Logs

IP pode ser armazenado de forma reduzida ou hasheada conforme finalidade. Não usar e-mail ou CNPJ como chave de log quando um UUID resolve.

## Backups

A exclusão deve considerar o ciclo de expiração de backups. Documentar que dados removidos do ambiente ativo podem permanecer em backups criptografados até a expiração prevista.
