import { ClientSecretCredential } from "@azure/identity";
import { CertificateClient } from "@azure/keyvault-certificates";
import { KeyClient } from "@azure/keyvault-keys";
import { SecretClient } from "@azure/keyvault-secrets";
import type { Env } from "../../config/env.js";

export type KeyVaultClients = {
  vaultUrl: string;
  certificateClient: CertificateClient;
  secretClient: SecretClient;
  keyClient: KeyClient;
};

export function isKeyVaultConfigured(env: Env): boolean {
  return Boolean(
    env.AZURE_KEY_VAULT_URL &&
      env.AZURE_TENANT_ID &&
      env.AZURE_CLIENT_ID &&
      env.AZURE_CLIENT_SECRET
  );
}

export function createKeyVaultClients(env: Env): KeyVaultClients {
  const vaultUrl = env.AZURE_KEY_VAULT_URL;
  const tenantId = env.AZURE_TENANT_ID;
  const clientId = env.AZURE_CLIENT_ID;
  const clientSecret = env.AZURE_CLIENT_SECRET;
  if (!vaultUrl || !tenantId || !clientId || !clientSecret) {
    throw new Error("Key Vault environment variables are not fully configured");
  }
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  return {
    vaultUrl,
    certificateClient: new CertificateClient(vaultUrl, credential),
    secretClient: new SecretClient(vaultUrl, credential),
    keyClient: new KeyClient(vaultUrl, credential),
  };
}
