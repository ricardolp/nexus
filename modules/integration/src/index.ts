export function getModuleName(): string {
  return 'integration';
}

export * from './shared';
export * from './integration-token';
export * from './webhook-endpoint';
export * from './webhook-delivery';
export * from './domain-event-outbox';
