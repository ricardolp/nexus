export const FISCAL_NFE_FLOW_INSTANCE_STATUSES = [
  'draft',
  'ready',
  'processing',
  'waiting_gate',
  'waiting_approval',
  'error',
  'blocked',
  'completed',
  'cancelled',
] as const;

export type FiscalNfeFlowInstanceStatus =
  (typeof FISCAL_NFE_FLOW_INSTANCE_STATUSES)[number];
