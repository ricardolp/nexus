/**
 * Azure Key Vault certificate names are limited to 3–127 alphanumeric characters and hyphens.
 * This scheme encodes org, company, and certificate ids without hyphens (32-char hex each).
 */
export function buildVaultCertificateName(
  organizationId: string,
  companyId: string,
  certificateId: string
): string {
  const o = organizationId.replace(/-/g, "");
  const c = companyId.replace(/-/g, "");
  const r = certificateId.replace(/-/g, "");
  return `nxo-${o}-c-${c}-r-${r}`;
}

export function buildPasswordSecretName(certBaseName: string): string {
  return `${certBaseName}-pwd`;
}

/** Stable Key Vault secret name for a company's SMTP password. */
export function buildSmtpPasswordSecretName(organizationId: string, companyId: string): string {
  const o = organizationId.replace(/-/g, "");
  const c = companyId.replace(/-/g, "");
  return `nxo-${o}-c-${c}-smtp-pwd`;
}

/** Stable Key Vault secret name for an organization's CPI OAuth2 client secret. */
export function buildCpiClientSecretSecretName(organizationId: string): string {
  const o = organizationId.replace(/-/g, "");
  return `nxo-${o}-cpi-client-secret`;
}
