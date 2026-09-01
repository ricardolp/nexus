# `users`

Identidade global da plataforma. Não armazena role de tenant.

## Regras

- `platform_role`: `admin` ou `member`.
- `member` deve possuir membership ativo para acessar dados de negócio.
- e-mail normalizado e único.
- senha com Argon2id.
- status: `pending`, `active`, `suspended`, `disabled`.
