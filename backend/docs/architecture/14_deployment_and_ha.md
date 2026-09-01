# Deployment, Escalabilidade e Alta Disponibilidade

## Containers

Cada componente roda como imagem imutável:

- `control_plane_api`
- `inbound_api`
- `fiscal_worker`
- `webhook_dispatcher`
- `outbox_relay`
- `scheduler`

## Alta disponibilidade

- pelo menos duas instâncias stateless de APIs;
- workers horizontalmente escaláveis;
- broker em cluster/serviço gerenciado;
- PostgreSQL Multi-AZ com réplica;
- Redis HA;
- object storage durável;
- múltiplas zonas;
- readiness e liveness;
- graceful shutdown;
- Pod Disruption Budget;
- autoscaling por CPU e backlog;
- deploy canary ou blue/green.

## Banco

- migrations versionadas;
- expand/contract;
- zero-downtime;
- índices criados de forma apropriada;
- PgBouncer;
- PITR;
- teste periódico de restore;
- partição para eventos e traces por data.

## Consistência

Não usar transação distribuída entre banco e broker. Usar transactional outbox.

## Disaster recovery

Definir:

- RPO;
- RTO;
- região secundária;
- procedimento de failover;
- restauração de segredos;
- reprocessamento de outbox;
- reconciliação com SEFAZ/provedor;
- comunicação ao cliente.
