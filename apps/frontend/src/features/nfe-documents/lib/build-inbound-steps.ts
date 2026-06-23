import { TIMELINE_STEP_ORDER } from '../constants/nfe-status-options';
import type {
  NfeFlowInstance,
  NfeInboundProcess,
  NfeInboundStatus,
  NfeDocumentTimeline,
  NfeSapDocument,
} from '../api/types';
import type { InboundStepVisualState } from '../constants/nfe-status-options';
import { getInboundStepState } from '../constants/nfe-status-options';

export type InboundFlowStep = {
  key: string;
  label: string;
  state: InboundStepVisualState;
  completedAt: string | null;
  sapDocuments: NfeSapDocument[];
  flowExecutions: NfeFlowInstance['executions'];
};

const STEP_SAP_TYPES: Record<string, NfeSapDocument['documentType'][]> = {
  pedido: ['purchase_order'],
  delivery: ['inbound_delivery'],
  migo: ['goods_movement', 'accounting_doc'],
  miro: ['invoice_verification'],
};

const STEP_FLOW_KEYS: Record<string, string[]> = {
  xml: ['IMPORT_XML', 'XML_IMPORT'],
  sefaz: ['SEFAZ_VALIDATION', 'VALIDATE_SEFAZ'],
  pedido: ['FETCH_PURCHASE_ORDERS', 'VALIDATE_PURCHASE_ORDER', 'PEDIDO_VALIDATION'],
  delivery: ['CREATE_INBOUND_DELIVERY', 'INBOUND_DELIVERY'],
  portaria: ['CONFIRM_PORTARIA', 'PORTARIA_GATE'],
  migo: ['REGISTER_MIGO', 'GOODS_MOVEMENT'],
  miro: ['RUN_MIRO', 'INVOICE_VERIFICATION', 'CREATE_INVOICE'],
};

const STEP_TIMESTAMP: Record<string, keyof NfeInboundProcess> = {
  xml: 'createdAt',
  sefaz: 'sefazValidatedAt',
  pedido: 'pedidoValidatedAt',
  delivery: 'deliveryCreatedAt',
  portaria: 'portariaConfirmedAt',
  migo: 'migoCompletedAt',
  miro: 'miroCompletedAt',
};

export function buildInboundFlowSteps(
  inbound: NfeInboundProcess | null,
  sapDocuments: NfeSapDocument[],
  flowInstance: NfeFlowInstance | null,
): InboundFlowStep[] {
  if (!inbound) return [];

  const currentStatus = inbound.inboundStatus;
  const executions = flowInstance?.executions ?? [];

  return TIMELINE_STEP_ORDER.map((step) => {
    const sapTypes = STEP_SAP_TYPES[step.key] ?? [];
    const stepSapDocs = sapDocuments.filter((d) =>
      sapTypes.includes(d.documentType),
    );
    const hasSuccessfulSapDoc = stepSapDocs.some(
      (doc) => doc.docNumber && doc.status === 'success',
    );

    let state = getInboundStepState(currentStatus, step.minStatus);
    if (hasSuccessfulSapDoc && state !== 'error') {
      state = 'done';
    }

    const tsKey = STEP_TIMESTAMP[step.key];
    let completedAt =
      tsKey && inbound[tsKey] ? String(inbound[tsKey]) : null;
    if (!completedAt && hasSuccessfulSapDoc) {
      const latestSapDoc = stepSapDocs
        .filter((doc) => doc.docNumber && doc.status === 'success')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      completedAt = latestSapDoc?.createdAt ?? null;
    }

    const flowKeys = STEP_FLOW_KEYS[step.key] ?? [];
    const stepExecutions = executions.filter((e) =>
      flowKeys.some((k) => e.stepKey.includes(k)),
    );

    return {
      key: step.key,
      label: step.label,
      state,
      completedAt,
      sapDocuments: stepSapDocs,
      flowExecutions: stepExecutions,
    };
  });
}

export function isTerminalInboundStatus(status: NfeInboundStatus): boolean {
  return status === 'miro_done' || status === 'rejected_inbound';
}

export function canResetInboundStatus(status: NfeInboundStatus): boolean {
  return status !== 'xml_imported' && status !== 'miro_done';
}

const STEP_TIMELINE_KEYWORDS: Record<string, string[]> = {
  xml: ['xml', 'import'],
  sefaz: ['sefaz'],
  pedido: ['pedido', 'purchase'],
  delivery: ['delivery', 'entrada'],
  portaria: ['portaria'],
  migo: ['migo', 'material'],
  miro: ['miro', 'fatur'],
};

export function timelineEntriesForStep(
  stepKey: string,
  timeline: NfeDocumentTimeline[],
): NfeDocumentTimeline[] {
  const keywords = STEP_TIMELINE_KEYWORDS[stepKey] ?? [];
  if (keywords.length === 0) return [];
  return timeline.filter((entry) => {
    const haystack = `${entry.title} ${entry.message ?? ''}`.toLowerCase();
    return keywords.some((k) => haystack.includes(k));
  });
}
