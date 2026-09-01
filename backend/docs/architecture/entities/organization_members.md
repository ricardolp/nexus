# `organization_members`

Vínculo de um `user` com uma `organization`.

## Regras

- unique por organização e usuário;
- membership suspenso não autentica no tenant;
- roles ficam em `organization_member_roles`.
