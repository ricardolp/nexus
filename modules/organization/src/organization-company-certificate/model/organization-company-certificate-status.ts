export const ORGANIZATION_COMPANY_CERTIFICATE_STATUSES = [
  'active',
  'inactive',
  'expired',
  'revoked',
] as const;

export type OrganizationCompanyCertificateStatus =
  (typeof ORGANIZATION_COMPANY_CERTIFICATE_STATUSES)[number];
