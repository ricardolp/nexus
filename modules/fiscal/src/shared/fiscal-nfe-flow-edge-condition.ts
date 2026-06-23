export const FISCAL_NFE_FLOW_EDGE_CONDITIONS = [
  'success',
  'error',
  'wait',
  'manual',
  'status_ok',
] as const;

export type FiscalNfeFlowEdgeCondition =
  (typeof FISCAL_NFE_FLOW_EDGE_CONDITIONS)[number];
