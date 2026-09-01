import type { ApiRole } from '@/lib/api-types';

export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

export function isPendingRole(role: ApiRole) {
  return role.id.startsWith(OPTIMISTIC_ID_PREFIX);
}
