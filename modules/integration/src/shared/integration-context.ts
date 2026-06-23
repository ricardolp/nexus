export interface IntegrationContext {
  tokenId: string;
  organizationId: string;
  scopes: string[];
}

export interface FiscalOperationContext {
  source: 'app' | 'integration';
  integrationTokenId?: string;
}
