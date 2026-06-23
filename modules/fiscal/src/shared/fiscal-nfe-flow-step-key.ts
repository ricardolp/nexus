export const FISCAL_NFE_FLOW_STEP_KEYS = [
  'FETCH_PURCHASE_ORDERS',
  'VALIDATIONS',
  'CREATE_DELIVERY',
  'WAIT_GATE_STATUS',
  'POST_MIGO',
  'CREATE_INVOICE',
  'NOTIFY_ERROR',
  'CUSTOM',
] as const;

export type FiscalNfeFlowStepKey =
  (typeof FISCAL_NFE_FLOW_STEP_KEYS)[number];

export const FISCAL_NFE_FLOW_STEP_KEY_TO_TYPE: Record<
  FiscalNfeFlowStepKey,
  'validation' | 'action' | 'wait' | 'approval'
> = {
  FETCH_PURCHASE_ORDERS: 'action',
  VALIDATIONS: 'validation',
  CREATE_DELIVERY: 'action',
  WAIT_GATE_STATUS: 'wait',
  POST_MIGO: 'action',
  CREATE_INVOICE: 'action',
  NOTIFY_ERROR: 'action',
  CUSTOM: 'action',
};
