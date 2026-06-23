export const FISCAL_NFE_FLOW_CONFIG_STATUSES = [
  'draft',
  'published',
  'archived',
] as const;

export type FiscalNfeFlowConfigStatus =
  (typeof FISCAL_NFE_FLOW_CONFIG_STATUSES)[number];
