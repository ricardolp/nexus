export const WEBHOOK_DELIVERY_STATUSES = [
  'pending',
  'delivered',
  'failed',
] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];
