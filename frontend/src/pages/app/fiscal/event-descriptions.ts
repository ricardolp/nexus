import type { ApiDocumentEvent } from '@/lib/api-types';
import { formatCNPJ } from './format';

// Human-readable translation for the fiscal inbound orchestrator's timeline
// (backend/internal/inbound) — see docs/architecture/17_status_and_event_catalog.md
// for the full event catalog and what metadata_json carries per event_type.

const stepTypeLabels: Record<string, string> = {
  RESOLVE_VENDOR: 'Resolução de fornecedor',
  RESOLVE_MATERIAL: 'Resolução de material',
  SEARCH_PURCHASE_ORDER: 'Busca de pedido de compra',
  CREATE_PURCHASE_ORDER: 'Pedido de compra',
  CREATE_INBOUND_DELIVERY: 'Entrega de entrada',
  POST_GOODS_RECEIPT: 'Recebimento de mercadoria (MIGO)',
  CREATE_SERVICE_ENTRY: 'Folha de entrada de serviço',
  POST_SUPPLIER_INVOICE: 'Fatura do fornecedor (MIRO)',
  POST_ACCOUNTING_DOCUMENT: 'Documento contábil'
};

const matchingStepLabels: Record<string, string> = {
  vendor: 'fornecedor',
  purchase_order: 'pedido de compra',
  material: 'material',
  quantity_price: 'quantidade/preço'
};

function stepLabel(stepType: unknown): string {
  if (typeof stepType !== 'string') return 'Etapa';
  return stepTypeLabels[stepType] ?? stepType;
}

function asMetadata(event: ApiDocumentEvent): Record<string, unknown> {
  return event.metadata_json && typeof event.metadata_json === 'object'
    ? (event.metadata_json as Record<string, unknown>)
    : {};
}

function humanizeEventType(eventType: string): string {
  const last = eventType.split('.').slice(0, -1).join(' ') || eventType;
  return last
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface DescribedEvent {
  title: string;
  description?: string;
}

export function describeInboundEvent(event: ApiDocumentEvent): DescribedEvent {
  const meta = asMetadata(event);

  switch (event.event_type) {
    case 'fiscal.document.received.v1':
      return { title: 'Documento recebido', description: 'Nota fiscal recebida pela plataforma.' };

    case 'fiscal.inbound.scenario_not_found.v1': {
      const bits: string[] = [];
      if (typeof meta.document_model === 'string' && meta.document_model) bits.push(`modelo ${meta.document_model}`);
      if (typeof meta.cfop === 'string' && meta.cfop) bits.push(`CFOP ${meta.cfop}`);
      if (typeof meta.vendor_cnpj === 'string' && meta.vendor_cnpj) {
        bits.push(`fornecedor ${formatCNPJ(meta.vendor_cnpj)}`);
      }
      const criteria = bits.length ? ` Critérios desta nota: ${bits.join(', ')}.` : '';
      return {
        title: 'Nenhum cenário de integração encontrado',
        description:
          `Nenhuma chamada ao SAP foi feita — não há fluxo ativo para esta empresa (ou o fluxo existente não casa com modelo/CFOP/fornecedor).${criteria} Um fluxo sem filtros extras vale para todas as notas da empresa.`
      };
    }

    case 'fiscal.inbound.sap_unavailable.v1':
      return {
        title: 'SAP indisponível',
        description: `Falha ao consultar o SAP durante a resolução de ${
          matchingStepLabels[String(meta.step)] ?? 'dados'
        }. O documento aguarda nova tentativa.`
      };

    case 'fiscal.inbound.action_required.v1':
      return {
        title: 'Ação manual necessária',
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    case 'fiscal.inbound.rejected.v1':
      return {
        title: 'Documento rejeitado',
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    case 'fiscal.inbound.plan_built.v1': {
      const stepCount = typeof meta.step_count === 'number' ? meta.step_count : undefined;
      const template = typeof meta.template_code === 'string' ? meta.template_code : undefined;
      return {
        title: 'Plano de execução criado',
        description: [
          template ? `Modelo de processo: ${template}` : null,
          stepCount !== undefined ? `${stepCount} etapa(s) no SAP` : null
        ]
          .filter(Boolean)
          .join(' · ')
      };
    }

    case 'fiscal.inbound.completed.v1':
      return { title: 'Integração concluída', description: 'Todas as etapas do plano foram finalizadas.' };

    case 'fiscal.inbound.step_completed.v1': {
      const sapDoc = typeof meta.sap_document_number === 'string' ? meta.sap_document_number : '';
      const mode = meta.mode === 'AUTO' ? 'automaticamente' : 'manualmente';
      return {
        title: `${stepLabel(meta.step_type)} concluído`,
        description: sapDoc
          ? `Documento SAP nº ${sapDoc}, lançado ${mode}.`
          : `Executado ${mode}, sem número de documento retornado.`
      };
    }

    case 'fiscal.inbound.step_failed.v1':
      return {
        title: `${stepLabel(meta.step_type)} falhou`,
        description: typeof meta.error_message === 'string' ? meta.error_message : String(meta.error_code ?? '')
      };

    case 'fiscal.inbound.step_skipped.v1':
      return {
        title: `${stepLabel(meta.step_type)} pulado`,
        description: typeof meta.reason === 'string' ? meta.reason : undefined
      };

    default:
      return { title: humanizeEventType(event.event_type) };
  }
}
