export const ORGANIZATION_COMPANY_STATUSES = ['active', 'inactive'] as const;

export type OrganizationCompanyStatus =
  (typeof ORGANIZATION_COMPANY_STATUSES)[number];
