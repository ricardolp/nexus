import { updateMe } from '@/lib/endpoints';
import type { ApiUser } from '@/lib/api-types';

export const PRODUCT_TOUR_FLAG = 'product_tour_completed';

export function isProductTourCompleted(appearance?: Record<string, unknown> | null) {
  return appearance?.[PRODUCT_TOUR_FLAG] === true;
}

export async function persistProductTourCompleted(
  token: string,
  appearance: Record<string, unknown> | null | undefined,
  completed: boolean
): Promise<ApiUser> {
  return updateMe(token, {
    appearance_json: {
      ...(appearance ?? {}),
      [PRODUCT_TOUR_FLAG]: completed
    }
  });
}
