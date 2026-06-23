import { createHmac } from 'crypto';
import { WebhookPayload } from '@nexus/shared';

export function buildWebhookBody(payload: WebhookPayload): string {
  return JSON.stringify(payload);
}

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  const signedPayload = `${timestamp}.${body}`;
  return createHmac('sha256', secret).update(signedPayload).digest('hex');
}

export const WEBHOOK_RETRY_DELAYS_MS = [
  60_000,
  300_000,
  1_800_000,
  7_200_000,
  43_200_000,
] as const;

export function getNextRetryDate(attempts: number): Date | null {
  const delay = WEBHOOK_RETRY_DELAYS_MS[attempts];
  if (!delay) {
    return null;
  }

  return new Date(Date.now() + delay);
}
