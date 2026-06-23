import type { FlowStepType } from '../api/types';

export interface StepLibraryItem {
  stepKey: string;
  name: string;
  type: FlowStepType;
  icon: string;
  defaultConfig: Record<string, unknown>;
}

export const STEP_LIBRARY: StepLibraryItem[] = [
  {
    stepKey: 'FETCH_PURCHASE_ORDERS',
    name: 'Buscar pedidos',
    type: 'action',
    icon: 'search',
    defaultConfig: {
      searchByXmlPurchaseOrder: true,
      required: true,
      onError: 'BLOCK_PROCESS',
    },
  },
  {
    stepKey: 'VALIDATIONS',
    name: 'Validar cabeçalho',
    type: 'validation',
    icon: 'clipboard',
    defaultConfig: {
      validatePurchaseOrder: true,
      validateSupplier: true,
      validateTotalValue: true,
      onError: 'BLOCK_AND_NOTIFY',
    },
  },
  {
    stepKey: 'VALIDATIONS',
    name: 'Validar valor',
    type: 'validation',
    icon: 'dollar',
    defaultConfig: { validateTotalValue: true, valueTolerance: 0.05 },
  },
  {
    stepKey: 'VALIDATIONS',
    name: 'Validar item',
    type: 'validation',
    icon: 'box',
    defaultConfig: { validateItemValue: true, validateQuantity: true },
  },
  {
    stepKey: 'VALIDATIONS',
    name: 'Validar fornecedor',
    type: 'validation',
    icon: 'user',
    defaultConfig: { validateSupplier: true, validateCnpj: true },
  },
  {
    stepKey: 'CREATE_DELIVERY',
    name: 'Criar delivery',
    type: 'action',
    icon: 'truck',
    defaultConfig: { automatic: true, onError: 'BLOCK_AND_NOTIFY' },
  },
  {
    stepKey: 'WAIT_GATE_STATUS',
    name: 'Aguardar portaria',
    type: 'wait',
    icon: 'clock',
    defaultConfig: {
      expectedStatus: 'EM_PORTARIA',
      timeoutHours: 24,
      onTimeout: 'NOTIFY_RESPONSIBLE',
    },
  },
  {
    stepKey: 'POST_MIGO',
    name: 'Lançar MIGO',
    type: 'action',
    icon: 'clipboard',
    defaultConfig: { automatic: true, movementType: '101', onError: 'BLOCK_PROCESS' },
  },
  {
    stepKey: 'CREATE_INVOICE',
    name: 'Faturar',
    type: 'action',
    icon: 'document',
    defaultConfig: { automatic: true, processType: 'MIRO', onDivergence: 'SEND_TO_FISCAL_APPROVAL' },
  },
  {
    stepKey: 'NOTIFY_ERROR',
    name: 'Notificar erro',
    type: 'action',
    icon: 'alert',
    defaultConfig: { notifyResponsible: true, blockProcess: true },
  },
];
