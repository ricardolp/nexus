# Fiscal Messaging Backend (Go)

Backend do SaaS de mensageria fiscal, implementado como **monólito modular** conforme a arquitetura em `docs/architecture/`.

## Estrutura de pastas

```text
backend/
├── cmd/                          # binários implantáveis
│   ├── control_plane_api/
│   ├── inbound_api/
│   ├── fiscal_worker/
│   ├── outbox_relay/
│   ├── webhook_dispatcher/
│   ├── scheduler/
│   └── migrate/
├── internal/
│   ├── config/                   # env / configuração
│   ├── identity/                 # users / registro / login
│   ├── organization/             # tenants, empresas, API clients
│   ├── fiscal/                   # documentos, worker, provedor
│   ├── billing/                  # extrato de mensageria (JSON + PDF)
│   ├── messaging/                # CloudEvents + outbox/inbox
│   ├── webhook/                  # endpoints, assinatura, entrega
│   ├── platform/                 # infra compartilhada
│   │   ├── auth/                 # JWT, scopes, middlewares
│   │   ├── broker/               # publicação de eventos
│   │   ├── crypto/               # Argon2id / hashes
│   │   ├── db/                   # PostgreSQL + tenant context
│   │   ├── domainerr/            # erros de domínio
│   │   ├── httpx/                # Problem Details / middleware
│   │   ├── ids/                  # UUIDv7
│   │   └── storage/              # object storage
│   └── transport/
│       └── httpapi/              # adapters HTTP (control + inbound)
├── migrations/                   # SQL versionado
├── scripts/                      # api.http e utilitários
├── docs/architecture/            # especificação de domínio
└── test/
    ├── README.md                 # como rodar os testes
    ├── helpers/                  # asserts e leitura de fixtures
    ├── testdata/                 # payloads JSON de exemplo
    └── unit/                     # testes unitários por domínio
        ├── identity/
        ├── organization/
        ├── fiscal/
        ├── messaging/
        ├── webhook/
        └── platform/
```

Cada módulo de negócio separa `model`, validação pura e `service` (persistência).  
Os testes unitários ficam centralizados em `test/unit/`, não misturados em `internal/`.

## Componentes

| Binário | Porta / papel |
|---|---|
| `control_plane_api` | `:4000` — usuários, orgs, empresas, API clients, webhooks |
| `inbound_api` | `:4001` — recebimento assíncrono de documentos (`202`) |
| `outbox_relay` | publica `outbox_events` → broker e agenda webhooks |
| `fiscal_worker` | processa documentos com conector stub SEFAZ |
| `webhook_dispatcher` | entrega webhooks assinados HMAC com retry |
| `scheduler` | limpeza de idempotência e jobs futuros |

## Setup (Windows — recomendado)

Um único comando sobe Docker, aplica migrations e abre todos os serviços:

```powershell
.\dev.cmd
```

Ou diretamente:

```powershell
.\scripts\dev.ps1
```

Opções úteis:

```powershell
.\scripts\dev.ps1 -SetupOnly   # só infra + migrate
.\scripts\dev.ps1 -ApiOnly     # só control_plane + inbound
.\scripts\dev.ps1 -Down        # para Postgres/RabbitMQ
```

## Setup (manual / Linux / macOS)

```bash
cp .env.example .env
docker compose up -d
go mod tidy
go run ./cmd/migrate -direction up
```

Em uma instalação vazia, crie o primeiro administrador fora da API:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD = "senha-super-segura"
go run ./cmd/bootstrap_admin
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

Depois do bootstrap, novos usuários são criados exclusivamente pelo fluxo de
convite autenticado. A rota pública `/v1/auth/register` não existe.

## Testes

```bash
# Windows (sem make)
go test ./test/unit/... -count=1

# Linux / macOS (com make)
make test                 # go test ./test/unit/...
make test-verbose         # com -v
```

Detalhes em `test/README.md`.

Cobertura unitária atual:

- `test/unit/identity` — email, senha, platform_role
- `test/unit/organization` — CNPJ, empresa, org, scopes
- `test/unit/fiscal` — normalização inbound, status, stub SEFAZ
- `test/unit/billing` — classificação de métricas, período, PDF
- `test/unit/messaging` — CloudEvents
- `test/unit/webhook` — HMAC, SSRF, backoff
- `test/unit/platform/*` — JWT, crypto, broker, storage, httpx, ids, domainerr

## Subir serviços (manual)

```bash
go run ./cmd/control_plane_api
go run ./cmd/inbound_api
go run ./cmd/outbox_relay
go run ./cmd/fiscal_worker
go run ./cmd/webhook_dispatcher
```

Fluxo HTTP de exemplo: `scripts/api.http`.
