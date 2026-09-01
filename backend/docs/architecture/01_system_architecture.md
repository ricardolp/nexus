# Arquitetura do Sistema

## Estilo recomendado

Começar como **monólito modular com workers separados**, não como dezenas de microsserviços.

Isso reduz custo operacional e mantém fronteiras claras. Os módulos podem ser extraídos quando houver escala, times independentes ou necessidade de isolamento.

## Componentes implantáveis

### `control_plane_api`

Responsável por:

- organizações;
- empresas;
- usuários;
- convites;
- roles e permissões;
- políticas de autenticação;
- integrações;
- webhooks;
- administração e suporte;
- extrato de consumo de mensageria (JSON e PDF).

### `inbound_api`

Endpoint de alto throughput para SAP, CPI e outros ERPs.

Responsável apenas por:

- autenticar credencial técnica;
- resolver tenant e empresa;
- validar envelope;
- aplicar idempotência;
- persistir recebimento;
- criar evento em `outbox_events`;
- responder rapidamente com HTTP `202`.

Não deve aguardar comunicação com SEFAZ.

### `fiscal_worker`

Responsável por:

- consumir documentos;
- selecionar provedor/conector fiscal;
- assinar e transmitir;
- consultar status;
- normalizar respostas;
- atualizar documento;
- produzir eventos de domínio.

### `webhook_dispatcher`

Responsável por:

- criar entregas;
- assinar payload;
- enviar;
- executar retries;
- bloquear endpoint com falhas persistentes;
- encaminhar para dead-letter.

### `outbox_relay`

Publica no broker eventos persistidos em `outbox_events`.

### `scheduler`

Executa:

- reconsultas;
- reprocessamentos;
- expiração de convites;
- rotação de credenciais;
- retenção;
- reconciliação;
- health checks de integrações.

## Infraestrutura

- PostgreSQL como banco transacional.
- Redis para rate limit, locks curtos e cache.
- RabbitMQ, Kafka ou serviço gerenciado equivalente.
- Object storage S3-compatible para XML, JSON e respostas.
- KMS/Vault para chaves e segredos.
- OpenTelemetry para traces, métricas e logs.
- WAF/API Gateway na borda.
- Serviço de e-mail transacional.
- SIEM para eventos críticos.

## Boundaries

O módulo fiscal não deve ler diretamente tabelas de autenticação para autorizar operações. A autorização acontece na borda e o contexto validado é propagado internamente.

O worker nunca confia em `organization_id` recebido dentro do payload fiscal. O tenant deve vir da credencial autenticada e do registro persistido.
