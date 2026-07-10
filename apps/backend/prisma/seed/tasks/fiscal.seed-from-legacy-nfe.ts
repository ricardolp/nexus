import { Client } from 'pg';
import type { Prisma, PrismaClient } from '@prisma/client';
import { NOVA_CONSULTING } from './organization.seed-nova-consulting';

type LegacyDoc = {
  id: string;
  chave_acesso: string;
  modelo: number;
  serie: string;
  numero_nf: string;
  data_emissao: Date | null;
  natureza_operacao: string | null;
  tipo_documento: number;
  uf: string | null;
  municipio: string | null;
  totais_icms_total_nota: string | null;
  valor_total_nota: string | null;
  protocolo: string | null;
  data: Date | null;
  status: string;
  context: unknown;
  created_at: Date;
  updated_at: Date;
};

type LegacyEmitent = {
  chave_acesso: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cep: string | null;
  endereco_uf: string | null;
  endereco_municipio: string | null;
  endereco_cod_municipio: string | null;
  endereco_telefone: string | null;
};

type LegacyClient = {
  chave_acesso: string;
  razao_social: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  email: string | null;
  inscricao_estadual: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cep: string | null;
  endereco_uf: string | null;
  endereco_municipio: string | null;
  endereco_cod_municipio: string | null;
  endereco_telefone: string | null;
};

type LegacyProduct = {
  chave_acesso: string;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade_comercial: string | null;
  quantidade_comercial: string | null;
  valor_total_bruto: string | null;
  numero_pedido: string | null;
  numero_item: string | null;
};

type LegacyEvent = {
  chave_acesso: string;
  tipo_evento: string;
  protocolo: string | null;
  protocolo_retorno: string | null;
  status_evento: string | null;
  descricao: string | null;
  justificativa: string | null;
  n_seq_evento: number | null;
  data_evento: Date | null;
  data_processamento: Date | null;
  created_at: Date;
};

type LegacyHistory = {
  chave_acesso: string;
  tipo_evento: string;
  status_anterior: string | null;
  status_novo: string | null;
  protocolo: string | null;
  mensagem: string | null;
  codigo_erro: string | null;
  descricao_erro: string | null;
  created_at: Date;
};

type LegacyAttachment = {
  chave_acesso: string;
  tipo: string;
  nome_arquivo: string | null;
  mime_type: string | null;
  conteudo_base64: string | null;
  tamanho_bytes: number | null;
  created_at: Date;
};

const STATUS_MAP: Record<
  string,
  | 'draft'
  | 'received'
  | 'validating'
  | 'validation_error'
  | 'waiting_processing'
  | 'sent_to_sefaz'
  | 'authorized'
  | 'rejected'
  | 'denied'
  | 'cancel_requested'
  | 'cancelled'
  | 'cancel_rejected'
  | 'inutilized'
  | 'processing_error'
  | 'contingency'
  | 'closed'
> = {
  AUTORIZADA: 'authorized',
  REJEITADA: 'rejected',
  CANCELADA: 'cancelled',
  AGUARDANDO_PROCESSAMENTO: 'waiting_processing',
  ERRO_NO_ENVIO: 'processing_error',
};

const ATTACHMENT_KIND_MAP: Record<
  string,
  | 'xml_authorized'
  | 'xml_cancel'
  | 'xml_correction_letter'
  | 'other'
> = {
  XML: 'xml_authorized',
  XML_CANCELAMENTO: 'xml_cancel',
  XML_CARTA_CORRECAO: 'xml_correction_letter',
};

const EVENT_TYPE_MAP: Record<
  string,
  | 'authorization'
  | 'cancellation'
  | 'correction_letter'
  | 'system_status_change'
  | 'manual_note'
> = {
  AUTORIZACAO: 'authorization',
  CANCELAMENTO: 'cancellation',
  CARTA_CORRECAO: 'correction_letter',
  CORRECAO: 'correction_letter',
};

const NOVA_EMITENTE = {
  razao_social: NOVA_CONSULTING.razaoSocial,
  nome_fantasia: NOVA_CONSULTING.nome,
  cnpj: NOVA_CONSULTING.cnpj,
  endereco_logradouro: NOVA_CONSULTING.address.logradouro,
  endereco_numero: NOVA_CONSULTING.address.numero,
  endereco_bairro: NOVA_CONSULTING.address.bairro,
  endereco_cep: NOVA_CONSULTING.address.cep.replace('-', ''),
  endereco_municipio: NOVA_CONSULTING.address.municipio,
  endereco_uf: NOVA_CONSULTING.address.uf,
  endereco_cod_municipio: '4104204',
  correspondencia: NOVA_CONSULTING.address.correspondencia,
};

function mapStatus(status: string) {
  return STATUS_MAP[status] ?? 'processing_error';
}

function parseIntSafe(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function isHomologation(client: LegacyClient | undefined, context: unknown): boolean {
  const name = client?.razao_social?.toUpperCase() ?? '';
  if (name.includes('HOMOLOGACAO') || name.includes('HOMOLOGAÇÃO')) return true;
  const ctx = JSON.stringify(context ?? {}).toUpperCase();
  return ctx.includes('HOMOLOGACAO') || ctx.includes('HOMOLOGAÇÃO');
}

function mapEventType(tipo: string) {
  const key = tipo.toUpperCase();
  return EVENT_TYPE_MAP[key] ?? 'system_status_change';
}

function partyFromEmitent(emitent: LegacyEmitent | typeof NOVA_EMITENTE) {
  return {
    razao_social: emitent.razao_social,
    nome_fantasia: 'nome_fantasia' in emitent ? emitent.nome_fantasia : null,
    cnpj: emitent.cnpj,
    inscricao_estadual:
      'inscricao_estadual' in emitent ? emitent.inscricao_estadual : null,
    endereco: {
      logradouro: emitent.endereco_logradouro,
      numero: emitent.endereco_numero,
      complemento:
        'endereco_complemento' in emitent ? emitent.endereco_complemento : null,
      bairro: emitent.endereco_bairro,
      cep: emitent.endereco_cep,
      municipio: emitent.endereco_municipio,
      uf: emitent.endereco_uf,
      cod_municipio: emitent.endereco_cod_municipio,
      telefone:
        'endereco_telefone' in emitent ? emitent.endereco_telefone : null,
    },
    ...('correspondencia' in emitent
      ? { correspondencia: emitent.correspondencia }
      : {}),
  };
}

function partyFromClient(client: LegacyClient | undefined) {
  if (!client) return null;
  return {
    razao_social: client.razao_social,
    tipo_documento: client.tipo_documento,
    numero_documento: client.numero_documento,
    email: client.email,
    inscricao_estadual: client.inscricao_estadual,
    endereco: {
      logradouro: client.endereco_logradouro,
      numero: client.endereco_numero,
      complemento: client.endereco_complemento,
      bairro: client.endereco_bairro,
      cep: client.endereco_cep,
      municipio: client.endereco_municipio,
      uf: client.endereco_uf,
      cod_municipio: client.endereco_cod_municipio,
      telefone: client.endereco_telefone,
    },
  };
}

export async function seedFromLegacyNfe(prisma: PrismaClient): Promise<void> {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  if (!legacyUrl) {
    console.log(
      '[seed:legacy-nfe] LEGACY_DATABASE_URL not set — skipping NFe migration',
    );
    return;
  }

  const company = await prisma.organizationCompany.findUnique({
    where: { cnpj: NOVA_CONSULTING.cnpj },
  });
  if (!company) {
    throw new Error(
      '[seed:legacy-nfe] Nova Consulting company not found. Run seedNovaConsultingOrganization first.',
    );
  }

  const existingCount = await prisma.fiscalNfeDocument.count({
    where: {
      company_id: company.id,
      deleted_at: null,
      idempotency_key: { startsWith: 'legacy:' },
    },
  });
  if (existingCount > 0) {
    console.log(
      `[seed:legacy-nfe] Already migrated ${existingCount} legacy documents — skipping`,
    );
    return;
  }

  const legacy = new Client({
    connectionString: legacyUrl,
    ssl: { rejectUnauthorized: false },
  });
  await legacy.connect();

  try {
    console.log('[seed:legacy-nfe] Loading legacy NFe data...');

    const docsResult = await legacy.query<LegacyDoc>(
      `SELECT id, chave_acesso, modelo, serie, numero_nf, data_emissao,
              natureza_operacao, tipo_documento, uf, municipio,
              totais_icms_total_nota::text, valor_total_nota::text,
              protocolo, data, status::text, context, created_at, updated_at
       FROM nfe_document
       ORDER BY data_emissao NULLS LAST, created_at`,
    );
    const docs = docsResult.rows;
    console.log(`[seed:legacy-nfe] Loaded ${docs.length} documents`);

    const emitents = await legacy.query<LegacyEmitent>(
      `SELECT chave_acesso, razao_social, nome_fantasia, cnpj, inscricao_estadual,
              endereco_logradouro, endereco_numero, endereco_complemento,
              endereco_bairro, endereco_cep, endereco_uf, endereco_municipio,
              endereco_cod_municipio, endereco_telefone
       FROM nfe_document_emitent`,
    );
    const clients = await legacy.query<LegacyClient>(
      `SELECT chave_acesso, razao_social, tipo_documento, numero_documento, email,
              inscricao_estadual, endereco_logradouro, endereco_numero,
              endereco_complemento, endereco_bairro, endereco_cep, endereco_uf,
              endereco_municipio, endereco_cod_municipio, endereco_telefone
       FROM nfe_document_client`,
    );
    const products = await legacy.query<LegacyProduct>(
      `SELECT chave_acesso, codigo, descricao, ncm, cfop, unidade_comercial,
              quantidade_comercial::text, valor_total_bruto::text,
              numero_pedido, numero_item
       FROM nfe_document_product
       ORDER BY chave_acesso, numero_item`,
    );
    const events = await legacy.query<LegacyEvent>(
      `SELECT chave_acesso, tipo_evento::text, protocolo, protocolo_retorno,
              status_evento, descricao, justificativa, n_seq_evento,
              data_evento, data_processamento, created_at
       FROM nfe_document_event`,
    );
    const history = await legacy.query<LegacyHistory>(
      `SELECT chave_acesso, tipo_evento::text, status_anterior::text,
              status_novo::text, protocolo, mensagem, codigo_erro,
              descricao_erro, created_at
       FROM nfe_document_history
       ORDER BY created_at`,
    );
    const attachments = await legacy.query<LegacyAttachment>(
      `SELECT chave_acesso, tipo::text, nome_arquivo, mime_type,
              conteudo_base64, tamanho_bytes, created_at
       FROM nfe_attachment
       WHERE tipo::text IN ('XML', 'XML_CANCELAMENTO', 'XML_CARTA_CORRECAO')`,
    );

    const emitentByKey = new Map(
      emitents.rows.map((row) => [row.chave_acesso, row]),
    );
    const clientByKey = new Map(
      clients.rows.map((row) => [row.chave_acesso, row]),
    );
    const productsByKey = new Map<string, LegacyProduct[]>();
    for (const product of products.rows) {
      const list = productsByKey.get(product.chave_acesso) ?? [];
      list.push(product);
      productsByKey.set(product.chave_acesso, list);
    }
    const eventsByKey = new Map<string, LegacyEvent[]>();
    for (const event of events.rows) {
      const list = eventsByKey.get(event.chave_acesso) ?? [];
      list.push(event);
      eventsByKey.set(event.chave_acesso, list);
    }
    const historyByKey = new Map<string, LegacyHistory[]>();
    for (const item of history.rows) {
      const list = historyByKey.get(item.chave_acesso) ?? [];
      list.push(item);
      historyByKey.set(item.chave_acesso, list);
    }
    const attachmentsByKey = new Map<string, LegacyAttachment[]>();
    for (const attachment of attachments.rows) {
      const list = attachmentsByKey.get(attachment.chave_acesso) ?? [];
      list.push(attachment);
      attachmentsByKey.set(attachment.chave_acesso, list);
    }

    // Avoid unique (company, model, series, number, environment) collisions
    // among active statuses by demoting duplicates to closed.
    const activeNumberKeys = new Set<string>();
    let migrated = 0;
    let outboundRewritten = 0;

    const BATCH = 25;
    for (let offset = 0; offset < docs.length; offset += BATCH) {
      const batch = docs.slice(offset, offset + BATCH);

      await prisma.$transaction(
        async (tx) => {
          for (const doc of batch) {
            const direction =
              doc.tipo_documento === 1 ? 'outbound' : 'inbound';
            const client = clientByKey.get(doc.chave_acesso);
            const emitent = emitentByKey.get(doc.chave_acesso);
            const environment = isHomologation(client, doc.context)
              ? 'homologation'
              : 'production';
            let status = mapStatus(doc.status);
            const series = parseIntSafe(doc.serie, 1);
            const number = parseIntSafe(doc.numero_nf, 0);
            const model = String(doc.modelo ?? 55).padStart(2, '0').slice(0, 2);

            const activeKey = `${model}:${series}:${number}:${environment}`;
            if (
              status !== 'cancelled' &&
              status !== 'inutilized' &&
              activeNumberKeys.has(activeKey)
            ) {
              status = 'closed';
            } else if (status !== 'cancelled' && status !== 'inutilized') {
              activeNumberKeys.add(activeKey);
            }

            const useNovaIssuer = direction === 'outbound';
            if (useNovaIssuer) outboundRewritten += 1;

            const issuerCnpj = useNovaIssuer
              ? NOVA_CONSULTING.cnpj
              : digitsOnly(emitent?.cnpj).slice(0, 14) || NOVA_CONSULTING.cnpj;
            const issuerName = useNovaIssuer
              ? NOVA_CONSULTING.razaoSocial
              : emitent?.razao_social ?? null;

            const totalAmount =
              doc.totais_icms_total_nota ?? doc.valor_total_nota ?? null;

            const metadata: Prisma.InputJsonValue = {
              legacy_id: doc.id,
              legacy_chave_acesso: doc.chave_acesso,
              natureza_operacao: doc.natureza_operacao,
              uf: doc.uf,
              municipio: doc.municipio,
              tipo_documento: doc.tipo_documento,
              emitente: useNovaIssuer
                ? partyFromEmitent(NOVA_EMITENTE)
                : emitent
                  ? partyFromEmitent(emitent)
                  : null,
              destinatario: partyFromClient(client),
              mock_migrated_from: 'legacy_nfe_document',
            };

            const created = await tx.fiscalNfeDocument.create({
              data: {
                organization_id: company.organization_id,
                company_id: company.id,
                direction,
                environment,
                status,
                model,
                series,
                number,
                access_key: doc.chave_acesso?.slice(0, 44) || null,
                issuer_cnpj: issuerCnpj,
                issuer_name: issuerName,
                recipient_document: digitsOnly(client?.numero_documento).slice(
                  0,
                  14,
                ) || null,
                recipient_name: client?.razao_social?.slice(0, 300) ?? null,
                total_amount: totalAmount,
                issued_at: doc.data_emissao,
                authorized_at:
                  status === 'authorized' || status === 'cancelled'
                    ? doc.data ?? doc.data_emissao
                    : null,
                cancelled_at: status === 'cancelled' ? doc.data : null,
                authorization_protocol: doc.protocolo?.slice(0, 20) ?? null,
                sefaz_status_code:
                  status === 'authorized'
                    ? '100'
                    : status === 'rejected'
                      ? '302'
                      : null,
                sefaz_status_message:
                  status === 'authorized'
                    ? 'Autorizado o uso da NF-e'
                    : status === 'rejected'
                      ? 'Rejeição'
                      : null,
                idempotency_key: `legacy:${doc.id}`,
                metadata,
                created_at: doc.created_at,
                updated_at: doc.updated_at,
              },
            });

            const docProducts = productsByKey.get(doc.chave_acesso) ?? [];
            if (docProducts.length > 0) {
              await tx.fiscalNfeDocumentItem.createMany({
                data: docProducts.map((product, index) => ({
                  document_id: created.id,
                  line_number: parseIntSafe(product.numero_item, index + 1) || index + 1,
                  prod_codigo: (product.codigo ?? `ITEM${index + 1}`).slice(0, 60),
                  descricao: (product.descricao ?? 'Item').slice(0, 500),
                  ncm: digitsOnly(product.ncm).slice(0, 8),
                  cfop: digitsOnly(product.cfop).slice(0, 4),
                  qty: product.quantidade_comercial ?? '1',
                  uom: (product.unidade_comercial ?? 'UN').slice(0, 10),
                  valor_total: product.valor_total_bruto ?? '0',
                  x_ped: product.numero_pedido?.slice(0, 60) ?? null,
                  n_item_ped: product.numero_item?.slice(0, 20) ?? null,
                  pedido_validation_status: 'pending',
                })),
              });
            }

            const docEvents = eventsByKey.get(doc.chave_acesso) ?? [];
            for (const [index, event] of docEvents.entries()) {
              const createdEvent = await tx.fiscalNfeDocumentEvent.create({
                data: {
                  organization_id: company.organization_id,
                  document_id: created.id,
                  event_type: mapEventType(event.tipo_evento),
                  event_status:
                    event.status_evento?.toUpperCase() === 'REJEITADO'
                      ? 'rejected'
                      : event.status_evento?.toUpperCase() === 'ERRO'
                        ? 'error'
                        : 'accepted',
                  sequence: event.n_seq_evento ?? index + 1,
                  protocol:
                    (event.protocolo_retorno ?? event.protocolo)?.slice(0, 20) ??
                    null,
                  request_summary: {
                    descricao: event.descricao,
                    justificativa: event.justificativa,
                    legacy_tipo: event.tipo_evento,
                  },
                  started_at: event.data_evento,
                  completed_at: event.data_processamento,
                  created_at: event.created_at,
                },
              });

              await tx.fiscalNfeDocumentTimeline.create({
                data: {
                  document_id: created.id,
                  event_id: createdEvent.id,
                  source: 'sefaz',
                  title: `Evento ${event.tipo_evento}`.slice(0, 255),
                  message: event.descricao ?? event.justificativa,
                  metadata: {
                    legacy_tipo: event.tipo_evento,
                    status_evento: event.status_evento,
                  },
                  created_at: event.created_at,
                },
              });
            }

            const docHistory = historyByKey.get(doc.chave_acesso) ?? [];
            // Cap history noise: keep last 20 entries per document
            const historySlice = docHistory.slice(-20);
            if (historySlice.length > 0) {
              await tx.fiscalNfeDocumentTimeline.createMany({
                data: historySlice.map((item) => ({
                  document_id: created.id,
                  source: 'system' as const,
                  title: item.tipo_evento.slice(0, 255),
                  message:
                    item.mensagem ??
                    item.descricao_erro ??
                    `${item.status_anterior ?? '?'} → ${item.status_novo ?? '?'}`,
                  metadata: {
                    legacy_tipo: item.tipo_evento,
                    status_anterior: item.status_anterior,
                    status_novo: item.status_novo,
                    protocolo: item.protocolo,
                    codigo_erro: item.codigo_erro,
                  },
                  created_at: item.created_at,
                })),
              });
            }

            const docAttachments = attachmentsByKey.get(doc.chave_acesso) ?? [];
            if (docAttachments.length > 0) {
              await tx.fiscalNfeDocumentAttachment.createMany({
                data: docAttachments.map((attachment) => {
                  const kind =
                    ATTACHMENT_KIND_MAP[attachment.tipo] ?? 'other';
                  const fileName =
                    attachment.nome_arquivo ??
                    `${doc.chave_acesso}-${attachment.tipo}.xml`;
                  return {
                    document_id: created.id,
                    kind,
                    file_name: fileName.slice(0, 512),
                    content_type: attachment.mime_type ?? 'application/xml',
                    storage_key: `mock://legacy/${doc.chave_acesso}/${attachment.tipo}`,
                    content: attachment.conteudo_base64,
                    size_bytes:
                      attachment.tamanho_bytes != null
                        ? BigInt(attachment.tamanho_bytes)
                        : null,
                    created_at: attachment.created_at,
                  };
                }),
              });
            }

            if (direction === 'inbound') {
              await tx.fiscalNfeInboundProcess.create({
                data: {
                  document_id: created.id,
                  inbound_status:
                    status === 'authorized' ? 'sefaz_validated' : 'xml_imported',
                  sefaz_validated_at:
                    status === 'authorized'
                      ? doc.data ?? doc.data_emissao
                      : null,
                },
              });
            }

            migrated += 1;
          }
        },
        { timeout: 120_000 },
      );

      console.log(
        `[seed:legacy-nfe] Progress ${Math.min(offset + BATCH, docs.length)}/${docs.length}`,
      );
    }

    console.log(
      `[seed:legacy-nfe] Migrated ${migrated} documents (${outboundRewritten} outbound with Nova Consulting issuer)`,
    );
  } finally {
    await legacy.end();
  }
}
