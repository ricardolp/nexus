# Nexus Backend

API Fastify + PostgreSQL + Redis (BullMQ).

## Desenvolvimento

```bash
npm install
cp .env.example .env   # se existir; configure DATABASE_URL e REDIS_URL
npm run db:reset       # zera PostgreSQL + Redis, migrations, um admin
npm run dev
npm run worker:email   # fila de e-mail (opcional)
npm run worker:nfe-inbound   # pipeline inbound após import XML
```

### Restore completo do banco

`npm run db:reset` executa:

1. `DROP SCHEMA drizzle` + `DROP SCHEMA public CASCADE` (remove journal Drizzle) e recria `public`
2. `npm run db:migrate`
3. Seed de **um** usuário platform admin
4. `FLUSHDB` no Redis

Credenciais padrão:

| Campo | Valor |
|-------|--------|
| E-mail | `admin@nexus.local` |
| Senha | `Admin123!` |

Override via `.env`: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`.

Em produção o comando aborta salvo `ALLOW_DB_RESET=true` ou `npm run db:reset -- --force`.

Somente o admin é criado — use Postman (**Setup → Login**) e depois crie organização, company e perfis com scopes NFe.

### Postman

Collection: [`postman/nexus-backend.postman_collection.json`](postman/nexus-backend.postman_collection.json)

### Outros scripts

| Script | Descrição |
|--------|-----------|
| `npm run db:seed:admin` | Recria/atualiza só o platform admin |
| `npm run db:seed:nfe` | Dados fake NFe (requer companies) |
| `npm run test:nfe-parser` | Testes do parser XML |
