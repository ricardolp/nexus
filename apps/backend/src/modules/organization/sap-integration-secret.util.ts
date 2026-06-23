export const SAP_INTEGRATION_LOCAL_SECRET_MARKER = 'local';

export function buildSapIntegrationSecretName(organizationId: string): string {
  const organizationKey = organizationId.replace(/-/g, '');
  return `nxo-${organizationKey}-cpi-client-secret`;
}
