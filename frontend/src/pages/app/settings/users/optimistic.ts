import type { ApiMember } from '@/lib/api-types';

export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

export function isPendingMember(member: ApiMember) {
  return member.id.startsWith(OPTIMISTIC_ID_PREFIX);
}
