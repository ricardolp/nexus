FROM golang:1.25-alpine AS build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/control_plane_api ./cmd/control_plane_api \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/inbound_api ./cmd/inbound_api \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/internal_api ./cmd/internal_api \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/migrate ./cmd/migrate \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/bootstrap_admin ./cmd/bootstrap_admin \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/seed ./cmd/seed \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/fiscal_worker ./cmd/fiscal_worker \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/outbox_relay ./cmd/outbox_relay \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/webhook_dispatcher ./cmd/webhook_dispatcher \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/scheduler ./cmd/scheduler \
 && CGO_ENABLED=0 GOOS=linux go build -o /out/inbound_orchestrator_worker ./cmd/inbound_orchestrator_worker

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/ /app/
COPY migrations /app/migrations
ENV PATH="/app:${PATH}"
EXPOSE 8080
CMD ["control_plane_api"]
