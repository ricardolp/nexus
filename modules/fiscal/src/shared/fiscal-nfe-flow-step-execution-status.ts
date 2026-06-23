export const FISCAL_NFE_FLOW_STEP_EXECUTION_STATUSES = [
  'pending',
  'running',
  'success',
  'error',
  'skipped',
  'disabled',
  'waiting_external_status',
] as const;

export type FiscalNfeFlowStepExecutionStatus =
  (typeof FISCAL_NFE_FLOW_STEP_EXECUTION_STATUSES)[number];
