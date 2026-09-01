# Testes

## Estrutura

```text
test/
├── helpers/              # asserts e leitura de fixtures
├── testdata/             # payloads JSON de exemplo
│   ├── fiscal/
│   └── webhook/
└── unit/                 # testes unitários (sem banco)
    ├── identity/
    ├── organization/
    ├── fiscal/
    ├── messaging/
    ├── webhook/
    └── platform/
        ├── auth/
        ├── broker/
        ├── crypto/
        ├── domainerr/
        ├── httpx/
        ├── ids/
        └── storage/
```

## Como rodar

```bash
# só unitários (pasta test/unit)
go test ./test/unit/... -count=1

# com verbose
go test ./test/unit/... -v

# via Makefile
make test
make test-unit
```

Os testes unitários vivem em `test/unit`, não ao lado do código em `internal/`.
Isso deixa a navegação do domínio mais clara e centraliza fixtures em `test/testdata`.
