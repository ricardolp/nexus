import type { FiscalNfeFlowStepKey } from '../../shared/fiscal-nfe-flow-step-key';
import type { FiscalNfeFlowStepType } from '../../shared/fiscal-nfe-flow-step-type';
import type { FiscalNfeFlowEdgeCondition } from '../../shared/fiscal-nfe-flow-edge-condition';

export interface DefaultFlowStepTemplate {
  stepKey: FiscalNfeFlowStepKey;
  name: string;
  type: FiscalNfeFlowStepType;
  sequence: number;
  active: boolean;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export interface DefaultFlowEdgeTemplate {
  sourceKey: FiscalNfeFlowStepKey;
  targetKey: FiscalNfeFlowStepKey;
  conditionType: FiscalNfeFlowEdgeCondition;
}

export const DEFAULT_FLOW_55_NAME = 'Fluxo padrão NF-e entrada';
export const DEFAULT_FLOW_55_VERSION = '1.0';

export const DEFAULT_FLOW_55_STEPS: DefaultFlowStepTemplate[] = [
  {
    stepKey: 'FETCH_PURCHASE_ORDERS',
    name: 'Buscar pedidos',
    type: 'action',
    sequence: 1,
    active: true,
    positionX: 0,
    positionY: 0,
    config: {
      searchByXmlPurchaseOrder: true,
      searchByExternalReference: true,
      searchBySupplier: false,
      searchByAccessKey: false,
      required: true,
      onError: 'BLOCK_PROCESS',
    },
  },
  {
    stepKey: 'VALIDATIONS',
    name: 'Validações',
    type: 'validation',
    sequence: 2,
    active: true,
    positionX: 0,
    positionY: 120,
    config: {
      validatePurchaseOrder: true,
      validateSupplier: true,
      validateCnpj: true,
      validateTotalValue: true,
      validateItemValue: true,
      validateQuantity: true,
      validateMaterial: true,
      validateNcm: true,
      validateCfop: true,
      validateUnit: true,
      validateTaxes: true,
      validateDivergence: true,
      valueTolerance: 0.05,
      percentageTolerance: 0.5,
      blockOnDivergence: true,
      allowManualApproval: true,
      itemValueTaxTypes: ['ICMS'],
      totalValueTaxTypes: ['ICMS', 'IPI'],
      taxComparisonTypes: ['ICMS', 'IPI'],
      advanceCondition: 'Todas as validações devem estar OK',
      onError: 'BLOCK_AND_NOTIFY',
    },
  },
  {
    stepKey: 'CREATE_DELIVERY',
    name: 'Criar delivery',
    type: 'action',
    sequence: 3,
    active: true,
    positionX: 0,
    positionY: 240,
    config: {
      automatic: true,
      groupingRule: 'BY_PURCHASE_ORDER',
      deliveryType: 'INBOUND',
      onError: 'BLOCK_AND_NOTIFY',
    },
  },
  {
    stepKey: 'WAIT_GATE_STATUS',
    name: 'Aguardar status de portaria',
    type: 'wait',
    sequence: 4,
    active: true,
    positionX: 0,
    positionY: 360,
    config: {
      expectedStatus: 'EM_PORTARIA',
      source: 'GUARDIAN',
      timeoutHours: 24,
      onTimeout: 'NOTIFY_RESPONSIBLE',
    },
  },
  {
    stepKey: 'POST_MIGO',
    name: 'Lançar MIGO',
    type: 'action',
    sequence: 5,
    active: true,
    positionX: 0,
    positionY: 480,
    config: {
      automatic: true,
      movementType: '101',
      validateQuantityBeforePost: true,
      allowPartialReceipt: false,
      onError: 'BLOCK_PROCESS',
    },
  },
  {
    stepKey: 'CREATE_INVOICE',
    name: 'Faturar',
    type: 'action',
    sequence: 6,
    active: true,
    positionX: 0,
    positionY: 600,
    config: {
      automatic: true,
      processType: 'MIRO',
      validateTaxes: true,
      validateNetValue: true,
      onDivergence: 'SEND_TO_FISCAL_APPROVAL',
    },
  },
  {
    stepKey: 'NOTIFY_ERROR',
    name: 'Notificar erro',
    type: 'action',
    sequence: 7,
    active: true,
    positionX: 300,
    positionY: 120,
    config: {
      notifyResponsible: true,
      blockProcess: true,
    },
  },
];

export const DEFAULT_FLOW_55_EDGES: DefaultFlowEdgeTemplate[] = [
  { sourceKey: 'FETCH_PURCHASE_ORDERS', targetKey: 'VALIDATIONS', conditionType: 'success' },
  { sourceKey: 'VALIDATIONS', targetKey: 'CREATE_DELIVERY', conditionType: 'success' },
  { sourceKey: 'VALIDATIONS', targetKey: 'NOTIFY_ERROR', conditionType: 'error' },
  { sourceKey: 'CREATE_DELIVERY', targetKey: 'WAIT_GATE_STATUS', conditionType: 'success' },
  { sourceKey: 'WAIT_GATE_STATUS', targetKey: 'POST_MIGO', conditionType: 'status_ok' },
  { sourceKey: 'POST_MIGO', targetKey: 'CREATE_INVOICE', conditionType: 'success' },
];

export const MODEL_55_REQUIRED_STEPS: FiscalNfeFlowStepKey[] = [
  'FETCH_PURCHASE_ORDERS',
  'VALIDATIONS',
  'CREATE_INVOICE',
  'NOTIFY_ERROR',
];
