import { ORGANIZATION_PERMISSIONS } from './organization.permissions';
import { FISCAL_PERMISSIONS } from './fiscal.permissions';
import { INTEGRATION_PERMISSIONS } from './integration.permissions';

export type Permission =
  | (typeof ORGANIZATION_PERMISSIONS)[number]
  | (typeof FISCAL_PERMISSIONS)[number]
  | (typeof INTEGRATION_PERMISSIONS)[number];
