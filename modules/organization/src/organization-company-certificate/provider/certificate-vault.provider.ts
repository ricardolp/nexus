export interface CertificateImportResult {
  certName: string;
  certId: string;
  keyId: string | null;
  passwordSecretName: string;
  passwordSecretId: string | null;
  thumbprint: string | null;
  subject: string | null;
  issuer: string | null;
  expiresAt: Date | null;
}

export interface CertificateVaultProvider {
  importPfx(
    certName: string,
    buffer: Buffer,
    password: string,
  ): Promise<CertificateImportResult>;
  deleteCertificate(certName: string): Promise<void>;
  deleteSecret(secretName: string): Promise<void>;
}
