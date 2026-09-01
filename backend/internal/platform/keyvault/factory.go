package keyvault

import "log/slog"

// Resolve picks the CertificateStore for the process: Azure Key Vault when
// AZURE_KEY_VAULT_URL is set (production), the encrypted local file store
// when SECRETS_ENCRYPTION_KEY is set but Key Vault isn't (local dev/on-prem
// — see docs/architecture/22_nfe_gateway_service.md, "Certificado digital:
// Key Vault ou local"), or the unconfigured stub that fails every operation
// with ErrNotConfigured as a last resort. Mirrors sap.Resolve/broker.Resolve.
func Resolve(azureVaultURL, localPath string, secretsEncryptionKey []byte, logger *slog.Logger) (CertificateStore, error) {
	if logger == nil {
		logger = slog.Default()
	}
	if azureVaultURL != "" {
		return NewAzureCertificateStore(azureVaultURL)
	}
	if len(secretsEncryptionKey) == 32 {
		logger.Warn("AZURE_KEY_VAULT_URL not set — using the local encrypted certificate store instead")
		return NewLocalFileCertificateStore(localPath, secretsEncryptionKey)
	}
	logger.Warn("neither AZURE_KEY_VAULT_URL nor a valid SECRETS_ENCRYPTION_KEY is set — certificate endpoints will respond 503")
	return NewUnconfiguredStore(), nil
}
