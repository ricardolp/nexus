import { FISCAL_PERMISSIONS } from './fiscal.permissions';
import {
  INTEGRATION_MANAGEMENT_PERMISSIONS,
} from './integration.permissions';
import { ORGANIZATION_PERMISSIONS } from './organization.permissions';

export const ALL_ORG_ROLE_PERMISSIONS = [
  ...ORGANIZATION_PERMISSIONS,
  ...FISCAL_PERMISSIONS,
  ...INTEGRATION_MANAGEMENT_PERMISSIONS,
] as const;

export const DEFAULT_ORGANIZATION_TI_ROLE = {
  nome: 'TI',
  slug: 'ti',
} as const;
