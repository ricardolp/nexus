export const FISCAL_NFE_FLOW_STEP_TYPES = [
  'validation',
  'action',
  'wait',
  'approval',
] as const;

export type FiscalNfeFlowStepType =
  (typeof FISCAL_NFE_FLOW_STEP_TYPES)[number];
