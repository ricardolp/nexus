export const FISCAL_NFE_ENVIRONMENTS = [
  'production',
  'homologation',
] as const;

export type FiscalNfeEnvironment = (typeof FISCAL_NFE_ENVIRONMENTS)[number];
