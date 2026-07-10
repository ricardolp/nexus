import type { Prisma, PrismaClient } from '@prisma/client';
import { NOVA_CONSULTING } from './organization.seed-nova-consulting';

const SUPPLIER = {
  cnpj: '12345678000199',
  name: 'Fornecedor Mock LTDA',
} as const;

const MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFeMOCK"><ide/><emit/><dest/><total/></infNFe></NFe>
</nfeProc>`;

type InboundStatus =
  | 'xml_imported'
  | 'sefaz_validated'
  | 'pedido_matched'
  | 'pedido_alert'
  | 'awaiting_portaria'
  | 'migo_done'
  | 'miro_done'
  | 'rejected_inbound';

type SapDocType =
  | 'purchase_order'
  | 'inbound_delivery'
  | 'goods_movement'
  | 'invoice_verification';

type Scenario = {
  key: string;
  number: number;
  inboundStatus: InboundStatus;
  docStatus: 'authorized' | 'received' | 'rejected';
  totalAmount: string;
  alertCode?: string;
  alertMessage?: string;
  rejectionReason?: string;
  pedidoValidation: 'pending' | 'matched' | 'alert';
  sapDocs: SapDocType[];
  withAuthorization: boolean;
  withPedidoEvent: boolean;
  withDeliveryEvent: boolean;
  withPortariaEvent: boolean;
  withMigoEvent: boolean;
  withMiroEvent: boolean;
  withRejectionEvent: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    key: 'xml-imported',
    number: 90001,
    inboundStatus: 'xml_imported',
    docStatus: 'received',
    totalAmount: '1500.00',
    pedidoValidation: 'pending',
    sapDocs: [],
    withAuthorization: false,
    withPedidoEvent: false,
    withDeliveryEvent: false,
    withPortariaEvent: false,
    withMigoEvent: false,
    withMiroEvent: false,
    withRejectionEvent: false,
  },
  {
    key: 'sefaz-validated',
    number: 90002,
    inboundStatus: 'sefaz_validated',
    docStatus: 'authorized',
    totalAmount: '3200.50',
    pedidoValidation: 'pending',
    sapDocs: [],
    withAuthorization: true,
    withPedidoEvent: false,
    withDeliveryEvent: false,
    withPortariaEvent: false,
    withMigoEvent: false,
    withMiroEvent: false,
    withRejectionEvent: false,
  },
  {
    key: 'pedido-matched',
    number: 90003,
    inboundStatus: 'pedido_matched',
    docStatus: 'authorized',
    totalAmount: '8750.00',
    pedidoValidation: 'matched',
    sapDocs: ['purchase_order'],
    withAuthorization: true,
    withPedidoEvent: true,
    withDeliveryEvent: false,
    withPortariaEvent: false,
    withMigoEvent: false,
    withMiroEvent: false,
    withRejectionEvent: false,
  },
  {
    key: 'pedido-alert',
    number: 90004,
    inboundStatus: 'pedido_alert',
    docStatus: 'authorized',
    totalAmount: '4100.00',
    alertCode: 'PEDIDO_DIVERGENCE',
    alertMessage: 'Quantidade do item 1 diverge do pedido de compra 4500012345.',
    pedidoValidation: 'alert',
    sapDocs: [],
    withAuthorization: true,
    withPedidoEvent: true,
    withDeliveryEvent: false,
    withPortariaEvent: false,
    withMigoEvent: false,
    withMiroEvent: false,
    withRejectionEvent: false,
  },
  {
    key: 'awaiting-portaria',
    number: 90005,
    inboundStatus: 'awaiting_portaria',
    docStatus: 'authorized',
    totalAmount: '12500.00',
    pedidoValidation: 'matched',
    sapDocs: ['purchase_order', 'inbound_delivery'],
    withAuthorization: true,
    withPedidoEvent: true,
    withDeliveryEvent: true,
    withPortariaEvent: false,
    withMigoEvent: false,
    withMiroEvent: false,
    withRejectionEvent: false,
  },
  {
    key: 'migo-done',
    number: 90006,
    inboundStatus: 'migo_done',
    docStatus: 'authorized',
    totalAmount: '9800.00',
    pedidoValidation: 'matched',
    sapDocs: ['purchase_order', 'inbound_delivery', 'goods_movement'],
    withAuthorization: true,
    withPedidoEvent: true,
    withDeliveryEvent: true,
    withPortariaEvent: true,
    withMigoEvent: true,
    withMiroEvent: false,
    withRejectionEvent: false,
  },
  {
    key: 'miro-done',
    number: 90007,
    inboundStatus: 'miro_done',
    docStatus: 'authorized',
    totalAmount: '15600.75',
    pedidoValidation: 'matched',
    sapDocs: [
      'purchase_order',
      'inbound_delivery',
      'goods_movement',
      'invoice_verification',
    ],
    withAuthorization: true,
    withPedidoEvent: true,
    withDeliveryEvent: true,
    withPortariaEvent: true,
    withMigoEvent: true,
    withMiroEvent: true,
    withRejectionEvent: false,
  },
  {
    key: 'rejected',
    number: 90008,
    inboundStatus: 'rejected_inbound',
    docStatus: 'authorized',
    totalAmount: '2200.00',
    rejectionReason: 'Documento rejeitado manualmente — divergência fiscal.',
    pedidoValidation: 'alert',
    sapDocs: [],
    withAuthorization: true,
    withPedidoEvent: true,
    withDeliveryEvent: false,
    withPortariaEvent: false,
    withMigoEvent: false,
    withMiroEvent: false,
    withRejectionEvent: true,
  },
];

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function buildAccessKey(series: number, number: number): string {
  const base = `422606136779640002005500${String(series).padStart(3, '0')}${String(number).padStart(9, '0')}649518162`;
  return base.slice(0, 44);
}

function sapDocNumber(type: SapDocType, number: number): string {
  const prefix: Record<SapDocType, string> = {
    purchase_order: '45',
    inbound_delivery: '18',
    goods_movement: '50',
    invoice_verification: '51',
  };
  return `${prefix[type]}${String(number).padStart(8, '0')}`;
}

export async function seedInboundNfeMocks(
  prisma: PrismaClient,
): Promise<void> {
  const organization = await prisma.organization.findUnique({
    where: { slug: NOVA_CONSULTING.slug },
  });
  if (!organization) {
    console.warn(
      '[seed:inbound-mocks] Nova Consulting org not found — skipping',
    );
    return;
  }

  const company = await prisma.organizationCompany.findFirst({
    where: {
      organization_id: organization.id,
      cnpj: NOVA_CONSULTING.cnpj,
      deleted_at: null,
    },
  });
  if (!company) {
    console.warn(
      '[seed:inbound-mocks] Nova Consulting company not found — skipping',
    );
    return;
  }

  let createdInbound = 0;
  let skippedInbound = 0;

  for (const scenario of SCENARIOS) {
    const idempotencyKey = `mock-inbound:${scenario.key}`;
    const existing = await prisma.fiscalNfeDocument.findFirst({
      where: { idempotency_key: idempotencyKey, deleted_at: null },
      select: { id: true },
    });
    if (existing) {
      skippedInbound += 1;
      continue;
    }

    const issuedAt = hoursAgo(48 - scenario.number % 10);
    const sefazAt = hoursAgo(40);
    const pedidoAt = hoursAgo(36);
    const deliveryAt = hoursAgo(30);
    const portariaAt = hoursAgo(24);
    const migoAt = hoursAgo(18);
    const miroAt = hoursAgo(12);

    await prisma.$transaction(async (tx) => {
      const document = await tx.fiscalNfeDocument.create({
        data: {
          organization_id: organization.id,
          company_id: company.id,
          direction: 'inbound',
          environment: 'homologation',
          status: scenario.docStatus,
          model: '55',
          series: 1,
          number: scenario.number,
          access_key: buildAccessKey(1, scenario.number),
          issuer_cnpj: SUPPLIER.cnpj,
          issuer_name: SUPPLIER.name,
          recipient_document: NOVA_CONSULTING.cnpj,
          recipient_name: NOVA_CONSULTING.razaoSocial,
          total_amount: scenario.totalAmount,
          issued_at: issuedAt,
          authorized_at:
            scenario.docStatus === 'authorized' ? sefazAt : null,
          authorization_protocol:
            scenario.docStatus === 'authorized'
              ? `1${String(scenario.number).padStart(14, '0')}`
              : null,
          sefaz_status_code:
            scenario.docStatus === 'authorized' ? '100' : null,
          sefaz_status_message:
            scenario.docStatus === 'authorized'
              ? 'Autorizado o uso da NF-e'
              : null,
          idempotency_key: idempotencyKey,
          metadata: {
            mock: true,
            scenario: scenario.key,
          } satisfies Prisma.InputJsonValue,
        },
      });

      const item = await tx.fiscalNfeDocumentItem.create({
        data: {
          document_id: document.id,
          line_number: 1,
          prod_codigo: `MOCK-${scenario.number}`,
          descricao: `Item mock cenário ${scenario.key}`,
          ncm: '84713012',
          cfop: '5102',
          qty: '1.0000',
          uom: 'UN',
          valor_total: scenario.totalAmount,
          x_ped: '4500012345',
          n_item_ped: '10',
          pedido_validation_status: scenario.pedidoValidation,
          pedido_validation_message:
            scenario.pedidoValidation === 'alert'
              ? scenario.alertMessage ?? 'Divergência no pedido'
              : scenario.pedidoValidation === 'matched'
                ? 'Pedido validado com sucesso'
                : null,
          sap_order_number:
            scenario.pedidoValidation === 'matched' ? '4500012345' : null,
          sap_order_item:
            scenario.pedidoValidation === 'matched' ? '00010' : null,
        },
      });

      await tx.fiscalNfeInboundProcess.create({
        data: {
          document_id: document.id,
          inbound_status: scenario.inboundStatus,
          status_changed_at: issuedAt,
          sefaz_validated_at: scenario.withAuthorization ? sefazAt : null,
          pedido_validated_at:
            scenario.withPedidoEvent &&
            scenario.inboundStatus !== 'xml_imported' &&
            scenario.inboundStatus !== 'sefaz_validated'
              ? pedidoAt
              : null,
          delivery_created_at: scenario.withDeliveryEvent
            ? deliveryAt
            : null,
          portaria_confirmed_at: scenario.withPortariaEvent
            ? portariaAt
            : null,
          migo_completed_at: scenario.withMigoEvent ? migoAt : null,
          miro_completed_at: scenario.withMiroEvent ? miroAt : null,
          rejected_at: scenario.withRejectionEvent ? hoursAgo(6) : null,
          rejection_reason: scenario.rejectionReason ?? null,
          alert_code: scenario.alertCode ?? null,
          alert_message: scenario.alertMessage ?? null,
          correlation_id: `mock-corr-${scenario.key}`,
        },
      });

      let sequence = 1;
      const events: Array<{ id: string; title: string; message: string; at: Date }> =
        [];

      const xmlEvent = await tx.fiscalNfeDocumentEvent.create({
        data: {
          organization_id: organization.id,
          document_id: document.id,
          event_type: 'xml_import',
          event_status: 'accepted',
          sequence: sequence++,
          sefaz_status_message: 'XML importado com sucesso',
          started_at: issuedAt,
          completed_at: issuedAt,
        },
      });
      events.push({
        id: xmlEvent.id,
        title: 'Importação XML',
        message: 'XML da NF-e importado no sistema.',
        at: issuedAt,
      });

      if (scenario.withAuthorization) {
        const authEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'authorization',
            event_status: 'accepted',
            sequence: sequence++,
            sefaz_status_code: '100',
            sefaz_status_message: 'Autorizado o uso da NF-e',
            protocol: document.authorization_protocol,
            started_at: sefazAt,
            completed_at: sefazAt,
          },
        });
        events.push({
          id: authEvent.id,
          title: 'Validação SEFAZ',
          message: 'Autorizado o uso da NF-e (cStat 100).',
          at: sefazAt,
        });
      }

      if (scenario.withPedidoEvent) {
        const pedidoEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'pedido_validation',
            event_status:
              scenario.pedidoValidation === 'alert' ? 'rejected' : 'accepted',
            sequence: sequence++,
            error_message:
              scenario.pedidoValidation === 'alert'
                ? scenario.alertMessage
                : null,
            sefaz_status_message:
              scenario.pedidoValidation === 'matched'
                ? 'Pedido validado'
                : 'Divergência no pedido',
            started_at: pedidoAt,
            completed_at: pedidoAt,
          },
        });
        events.push({
          id: pedidoEvent.id,
          title: 'Validação pedido',
          message:
            scenario.alertMessage ?? 'Pedido de compra validado com sucesso.',
          at: pedidoAt,
        });
      }

      if (scenario.withDeliveryEvent) {
        const deliveryEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'sap_delivery_create',
            event_status: 'accepted',
            sequence: sequence++,
            sefaz_status_message: 'Inbound delivery criado no SAP',
            started_at: deliveryAt,
            completed_at: deliveryAt,
          },
        });
        events.push({
          id: deliveryEvent.id,
          title: 'Criação delivery SAP',
          message: 'Inbound delivery criado com sucesso.',
          at: deliveryAt,
        });
      }

      if (scenario.withPortariaEvent) {
        const portariaEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'portaria_confirmation',
            event_status: 'accepted',
            sequence: sequence++,
            sefaz_status_message: 'Portaria confirmada',
            started_at: portariaAt,
            completed_at: portariaAt,
          },
        });
        events.push({
          id: portariaEvent.id,
          title: 'Confirmação portaria',
          message: 'Recebimento físico confirmado na portaria.',
          at: portariaAt,
        });
      }

      if (scenario.withMigoEvent) {
        const migoEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'sap_migo',
            event_status: 'accepted',
            sequence: sequence++,
            sefaz_status_message: 'MIGO lançado',
            started_at: migoAt,
            completed_at: migoAt,
          },
        });
        events.push({
          id: migoEvent.id,
          title: 'Lançamento MIGO',
          message: 'Entrada de mercadoria registrada no SAP.',
          at: migoAt,
        });
      }

      if (scenario.withMiroEvent) {
        const miroEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'sap_miro',
            event_status: 'accepted',
            sequence: sequence++,
            sefaz_status_message: 'MIRO faturado',
            started_at: miroAt,
            completed_at: miroAt,
          },
        });
        events.push({
          id: miroEvent.id,
          title: 'Faturamento MIRO',
          message: 'Fatura de fornecedor criada no SAP.',
          at: miroAt,
        });
      }

      if (scenario.withRejectionEvent) {
        const rejectionEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'inbound_rejection',
            event_status: 'accepted',
            sequence: sequence++,
            error_message: scenario.rejectionReason,
            started_at: hoursAgo(6),
            completed_at: hoursAgo(6),
          },
        });
        events.push({
          id: rejectionEvent.id,
          title: 'Rejeição inbound',
          message: scenario.rejectionReason ?? 'Documento rejeitado.',
          at: hoursAgo(6),
        });
      }

      for (const entry of events) {
        await tx.fiscalNfeDocumentTimeline.create({
          data: {
            document_id: document.id,
            event_id: entry.id,
            source: 'system',
            title: entry.title.slice(0, 255),
            message: entry.message,
            created_at: entry.at,
          },
        });
      }

      await tx.fiscalNfeDocumentAttachment.create({
        data: {
          document_id: document.id,
          event_id: xmlEvent.id,
          kind: 'xml_authorized',
          file_name: `nfe-${scenario.number}.xml`,
          content_type: 'application/xml',
          storage_key: `mock://inbound/${scenario.key}.xml`,
          content: MOCK_XML,
          size_bytes: BigInt(MOCK_XML.length),
        },
      });

      for (const [index, sapType] of scenario.sapDocs.entries()) {
        await tx.fiscalNfeSapDocument.create({
          data: {
            document_id: document.id,
            item_id: sapType === 'purchase_order' ? item.id : null,
            document_type: sapType,
            doc_number: sapDocNumber(sapType, scenario.number + index),
            item_number: sapType === 'purchase_order' ? '00010' : null,
            fiscal_year: '2026',
            status: 'success',
            raw_response: { mock: true, type: sapType },
          },
        });
      }
    });

    createdInbound += 1;
  }

  // Outbound mocks with events so the Eventos tab is populated
  let createdOutbound = 0;
  let skippedOutbound = 0;
  const outboundScenarios = [
    {
      key: 'authorized',
      number: 91001,
      withCorrection: false,
    },
    {
      key: 'with-cce',
      number: 91002,
      withCorrection: true,
    },
  ] as const;

  for (const scenario of outboundScenarios) {
    const idempotencyKey = `mock-outbound-events:${scenario.key}`;
    const existing = await prisma.fiscalNfeDocument.findFirst({
      where: { idempotency_key: idempotencyKey, deleted_at: null },
      select: { id: true },
    });
    if (existing) {
      skippedOutbound += 1;
      continue;
    }

    const issuedAt = hoursAgo(72);
    const authAt = hoursAgo(70);
    const cceAt = hoursAgo(48);

    await prisma.$transaction(async (tx) => {
      const document = await tx.fiscalNfeDocument.create({
        data: {
          organization_id: organization.id,
          company_id: company.id,
          direction: 'outbound',
          environment: 'homologation',
          status: 'authorized',
          model: '55',
          series: 2,
          number: scenario.number,
          access_key: buildAccessKey(2, scenario.number),
          issuer_cnpj: NOVA_CONSULTING.cnpj,
          issuer_name: NOVA_CONSULTING.razaoSocial,
          recipient_document: '35099367000350',
          recipient_name:
            'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
          total_amount: '300000.00',
          issued_at: issuedAt,
          authorized_at: authAt,
          authorization_protocol: `2${String(scenario.number).padStart(14, '0')}`,
          sefaz_status_code: '100',
          sefaz_status_message: 'Autorizado o uso da NF-e',
          idempotency_key: idempotencyKey,
          metadata: {
            mock: true,
            scenario: scenario.key,
          } satisfies Prisma.InputJsonValue,
        },
      });

      await tx.fiscalNfeDocumentItem.create({
        data: {
          document_id: document.id,
          line_number: 1,
          prod_codigo: `OUT-${scenario.number}`,
          descricao: 'Serviço de consultoria mock',
          ncm: '00000000',
          cfop: '5933',
          qty: '1.0000',
          uom: 'UN',
          valor_total: '300000.00',
        },
      });

      const authEvent = await tx.fiscalNfeDocumentEvent.create({
        data: {
          organization_id: organization.id,
          document_id: document.id,
          event_type: 'authorization',
          event_status: 'accepted',
          sequence: 1,
          sefaz_status_code: '100',
          sefaz_status_message: 'Autorizado o uso da NF-e',
          protocol: document.authorization_protocol,
          started_at: authAt,
          completed_at: authAt,
        },
      });

      await tx.fiscalNfeDocumentTimeline.create({
        data: {
          document_id: document.id,
          event_id: authEvent.id,
          source: 'sefaz',
          title: 'Autorização SEFAZ',
          message: 'NF-e autorizada com sucesso.',
          created_at: authAt,
        },
      });

      if (scenario.withCorrection) {
        const cceEvent = await tx.fiscalNfeDocumentEvent.create({
          data: {
            organization_id: organization.id,
            document_id: document.id,
            event_type: 'correction_letter',
            event_status: 'accepted',
            sequence: 2,
            sefaz_status_code: '135',
            sefaz_status_message: 'Evento registrado e vinculado a NF-e',
            protocol: `3${String(scenario.number).padStart(14, '0')}`,
            request_summary: {
              correcao: 'Correção do endereço de entrega no campo xLgr.',
            },
            started_at: cceAt,
            completed_at: cceAt,
          },
        });

        await tx.fiscalNfeDocumentTimeline.create({
          data: {
            document_id: document.id,
            event_id: cceEvent.id,
            source: 'sefaz',
            title: 'Carta de correção',
            message: 'CC-e registrada e vinculada à NF-e.',
            created_at: cceAt,
          },
        });
      }

      await tx.fiscalNfeDocumentAttachment.create({
        data: {
          document_id: document.id,
          event_id: authEvent.id,
          kind: 'xml_authorized',
          file_name: `nfe-out-${scenario.number}.xml`,
          content_type: 'application/xml',
          storage_key: `mock://outbound/${scenario.key}.xml`,
          content: MOCK_XML,
          size_bytes: BigInt(MOCK_XML.length),
        },
      });

      await tx.fiscalNfeDocumentTimeline.create({
        data: {
          document_id: document.id,
          source: 'system',
          title: 'Documento criado',
          message: 'NF-e outbound mock criada pelo seed.',
          created_at: issuedAt,
        },
      });
    });

    createdOutbound += 1;
  }

  console.log(
    `[seed:inbound-mocks] inbound created=${createdInbound} skipped=${skippedInbound}; outbound created=${createdOutbound} skipped=${skippedOutbound}`,
  );
}
