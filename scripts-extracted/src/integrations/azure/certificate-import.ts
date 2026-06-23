import type {
  CertificateClient,
  KeyVaultCertificateWithPolicy,
} from "@azure/keyvault-certificates";
import type { KeyClient } from "@azure/keyvault-keys";
import type { SecretClient } from "@azure/keyvault-secrets";
import { buildPasswordSecretName } from "./vault-names.js";

export type ImportPfxParams = {
  certificateClient: CertificateClient;
  certificateName: string;
  pfxBytes: Buffer;
  password: string;
};

export type ImportedCertificateMetadata = {
  keyVaultCertName: string;
  keyVaultCertId: string;
  thumbprint: string | null;
  subject: string | null;
  issuer: string | null;
  expiresAt: Date | null;
};

export function mapCertificateToMetadata(
  imported: KeyVaultCertificateWithPolicy,
  vaultUrl: string
): ImportedCertificateMetadata {
  const props = imported.properties;
  const name = props.name ?? "";
  let thumbprint: string | null = props.x509ThumbprintString ?? null;
  if (!thumbprint && props.x509Thumbprint && props.x509Thumbprint.length > 0) {
    thumbprint = Buffer.from(props.x509Thumbprint).toString("hex");
  }
  const policy = imported.policy;
  const subject =
    policy && "subject" in policy && typeof policy.subject === "string"
      ? policy.subject
      : null;
  const issuer =
    policy && "issuerName" in policy && typeof policy.issuerName === "string"
      ? policy.issuerName
      : null;
  const certId =
    props.id ??
    (props.version
      ? `${vaultUrl}/certificates/${name}/${props.version}`
      : `${vaultUrl}/certificates/${name}`);
  return {
    keyVaultCertName: name,
    keyVaultCertId: certId,
    thumbprint,
    subject,
    issuer,
    expiresAt: props.expiresOn ?? null,
  };
}

export async function importPfxCertificate(
  params: ImportPfxParams
): Promise<KeyVaultCertificateWithPolicy> {
  const { certificateClient, certificateName, pfxBytes, password } = params;
  const bytes = new Uint8Array(pfxBytes);
  return certificateClient.importCertificate(certificateName, bytes, {
    password,
  });
}

export async function resolveKeyVaultKeyId(
  keyClient: KeyClient,
  keyName: string
): Promise<string | null> {
  const key = await keyClient.getKey(keyName);
  const kid = key.key?.kid;
  return kid ? String(kid).trim() : null;
}

export type PasswordSecretResult = {
  name: string;
  id: string | null;
};

export async function storePasswordSecret(
  secretClient: SecretClient,
  certBaseName: string,
  password: string
): Promise<PasswordSecretResult> {
  const secretName = buildPasswordSecretName(certBaseName);
  return storeNamedSecret(secretClient, secretName, password);
}

export async function storeNamedSecret(
  secretClient: SecretClient,
  secretName: string,
  value: string
): Promise<PasswordSecretResult> {
  const result = await secretClient.setSecret(secretName, value);
  const id = result.properties.id ? String(result.properties.id) : null;
  return { name: result.name, id };
}

/** Deletes cert, password secret, and key (best-effort; ignores not-found). */
export async function bestEffortDeleteCertificateResources(options: {
  certificateClient: CertificateClient;
  secretClient: SecretClient;
  keyClient: KeyClient;
  certificateName: string;
  passwordSecretName: string;
}): Promise<void> {
  const { certificateClient, secretClient, keyClient, certificateName, passwordSecretName } =
    options;

  await Promise.allSettled([
    (async () => {
      const poller = await certificateClient.beginDeleteCertificate(certificateName);
      await poller.pollUntilDone();
    })(),
    (async () => {
      const poller = await secretClient.beginDeleteSecret(passwordSecretName);
      await poller.pollUntilDone();
    })(),
    (async () => {
      const poller = await keyClient.beginDeleteKey(certificateName);
      await poller.pollUntilDone();
    })(),
  ]);
}

export async function rollbackImportedCertificate(options: {
  certificateClient: CertificateClient;
  secretClient: SecretClient;
  keyClient: KeyClient;
  certificateName: string;
  passwordSecretName: string;
}): Promise<void> {
  await bestEffortDeleteCertificateResources({
    ...options,
    keyClient: options.keyClient,
  });
}
