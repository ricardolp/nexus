export const INTEGRATION_TOKEN_PREFIX = 'nxk_live_';

export function buildIntegrationTokenSecret(prefix: string, randomPart: string): string {
  return `${prefix}${randomPart}`;
}

export function extractTokenPrefix(secret: string): string {
  return secret.slice(0, 16);
}
