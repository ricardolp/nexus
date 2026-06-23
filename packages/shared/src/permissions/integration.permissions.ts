export const INTEGRATION_API_SCOPES = [
  'integration:documents:nfe:emit',
  'integration:documents:nfe:consult',
  'integration:documents:nfe:events:emit',
  'integration:documents:nfe:events:consult',
  'integration:documents:nfe:items:emit',
  'integration:documents:nfe:items:consult',
  'integration:documents:nfe:timeline:emit',
  'integration:documents:nfe:timeline:consult',
  'integration:documents:nfe:attachments:emit',
  'integration:documents:nfe:attachments:consult',
  'integration:documents:nfe:inbound-process:emit',
  'integration:documents:nfe:inbound-process:consult',
  'integration:documents:nfe:sap-documents:emit',
  'integration:documents:nfe:sap-documents:consult',
  'integration:documents:nfse:emit',
  'integration:documents:nfse:consult',
  'integration:documents:nfse:events:emit',
  'integration:documents:nfse:events:consult',
  'integration:documents:nfse:items:emit',
  'integration:documents:nfse:items:consult',
  'integration:documents:nfse:timeline:emit',
  'integration:documents:nfse:timeline:consult',
  'integration:documents:nfse:attachments:emit',
  'integration:documents:nfse:attachments:consult',
  'integration:documents:nfse:inbound-process:emit',
  'integration:documents:nfse:inbound-process:consult',
  'integration:documents:nfse:sap-documents:emit',
  'integration:documents:nfse:sap-documents:consult',
  'integration:companies:number-ranges:nfe:emit',
  'integration:companies:number-ranges:nfe:consult',
  'integration:companies:number-ranges:nfe:events:emit',
  'integration:companies:number-ranges:nfe:events:consult',
  'integration:companies:number-ranges:nfse:emit',
  'integration:companies:number-ranges:nfse:consult',
  'integration:companies:number-ranges:nfse:events:emit',
  'integration:companies:number-ranges:nfse:events:consult',
] as const;

export const INTEGRATION_MANAGEMENT_PERMISSIONS = [
  'integration:tokens:manage',
  'integration:webhooks:manage',
] as const;

export const INTEGRATION_PERMISSIONS = [
  ...INTEGRATION_API_SCOPES,
  ...INTEGRATION_MANAGEMENT_PERMISSIONS,
] as const;

export type IntegrationApiScope = (typeof INTEGRATION_API_SCOPES)[number];
export type IntegrationManagementPermission =
  (typeof INTEGRATION_MANAGEMENT_PERMISSIONS)[number];
