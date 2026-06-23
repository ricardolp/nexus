import { eq } from "drizzle-orm";
import type { Env } from "../../config/env.js";
import { AppError } from "../../common/http/errors.js";
import type { Db } from "../../db/client.js";

export type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
import { organizationIntegrationSettings } from "../../db/schema.js";
import {
  createKeyVaultClients,
  isKeyVaultConfigured,
} from "../azure/keyvault-clients.js";

export type CpiCredentials = {
  cpiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  sapClient: string;
  sapLanguage: string;
};

export type CpiIntegrationRow = {
  cpiBaseUrl: string | null;
  clientId: string | null;
  clientSecretSecretName: string | null;
  clientSecretSecretId: string | null;
  sapClient: string | null;
  sapLanguage: string | null;
};

export async function getOrganizationCpiIntegrationRow(
  db: DbConn,
  organizationId: string
): Promise<CpiIntegrationRow | null> {
  const [row] = await db
    .select({
      cpiBaseUrl: organizationIntegrationSettings.cpiBaseUrl,
      clientId: organizationIntegrationSettings.clientId,
      clientSecretSecretName: organizationIntegrationSettings.clientSecretSecretName,
      clientSecretSecretId: organizationIntegrationSettings.clientSecretSecretId,
      sapClient: organizationIntegrationSettings.sapClient,
      sapLanguage: organizationIntegrationSettings.sapLanguage,
    })
    .from(organizationIntegrationSettings)
    .where(eq(organizationIntegrationSettings.organizationId, organizationId))
    .limit(1);

  return row ?? null;
}

export function isCpiIntegrationComplete(row: CpiIntegrationRow | null): row is CpiIntegrationRow & {
  cpiBaseUrl: string;
  clientId: string;
  clientSecretSecretId: string;
  sapClient: string;
} {
  return Boolean(
    row?.cpiBaseUrl?.trim() &&
      row?.clientId?.trim() &&
      row?.clientSecretSecretId &&
      row?.sapClient?.trim()
  );
}

export async function getCpiCredentials(
  db: DbConn,
  env: Env,
  organizationId: string
): Promise<CpiCredentials> {
  const row = await getOrganizationCpiIntegrationRow(db, organizationId);
  if (!isCpiIntegrationComplete(row)) {
    throw new AppError("integration_not_configured", 503);
  }

  if (!isKeyVaultConfigured(env)) {
    throw new AppError("key_vault_error", 503);
  }

  const kv = createKeyVaultClients(env);
  const secretName = row.clientSecretSecretName;
  if (!secretName) {
    throw new AppError("integration_not_configured", 503);
  }

  let clientSecret: string;
  try {
    const secret = await kv.secretClient.getSecret(secretName);
    clientSecret = secret.value ?? "";
  } catch {
    throw new AppError("key_vault_error", 503);
  }

  if (!clientSecret.trim()) {
    throw new AppError("integration_not_configured", 503);
  }

  return {
    cpiBaseUrl: row.cpiBaseUrl.trim(),
    clientId: row.clientId.trim(),
    clientSecret: clientSecret.trim(),
    sapClient: row.sapClient.trim(),
    sapLanguage: row.sapLanguage?.trim() || "PT",
  };
}
