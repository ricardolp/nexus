export const FISCAL_NFSE_ENVIRONMENTS = [
  'production',
  'homologation',
] as const;

export type FiscalNfseEnvironment = (typeof FISCAL_NFSE_ENVIRONMENTS)[number];
