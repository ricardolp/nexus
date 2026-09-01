.PHONY: deps migrate-up run-control-plane run-inbound run-fiscal-worker run-outbox run-webhook docker-up docker-down build test test-unit test-verbose seed

deps:
	go mod tidy

docker-up:
	docker compose up -d

docker-down:
	docker compose down

migrate-up:
	go run ./cmd/migrate -direction up

migrate-down:
	go run ./cmd/migrate -direction down

seed:
	go run ./cmd/seed

build:
	go build -o bin/control_plane_api ./cmd/control_plane_api
	go build -o bin/inbound_api ./cmd/inbound_api
	go build -o bin/fiscal_worker ./cmd/fiscal_worker
	go build -o bin/outbox_relay ./cmd/outbox_relay
	go build -o bin/webhook_dispatcher ./cmd/webhook_dispatcher
	go build -o bin/scheduler ./cmd/scheduler

run-control-plane:
	go run ./cmd/control_plane_api

run-inbound:
	go run ./cmd/inbound_api

run-fiscal-worker:
	go run ./cmd/fiscal_worker

run-outbox:
	go run ./cmd/outbox_relay

run-webhook:
	go run ./cmd/webhook_dispatcher

# Testes unitários centralizados em test/unit
test: test-unit

test-unit:
	go test ./test/unit/... -count=1

test-verbose:
	go test ./test/unit/... -count=1 -v
