import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { organizationIntegrationSettings } from "../../../db/schema.js";
import { storeNamedSecret } from "../../../integrations/azure/certificate-import.js";
import {
  createKeyVaultClients,
  isKeyVaultConfigured,
} from "../../../integrations/azure/keyvault-clients.js";
import { buildCpiClientSecretSecretName } from "../../../integrations/azure/vault-names.js";

export type OrganizationIntegrationAuthType = "oauth2_client_credentials";

export type OrganizationIntegrationSettingsPublic = {
  id: string | null;
  organizationId: string;
  cpiBaseUrl: string | null;
  clientId: string | null;
  authType: OrganizationIntegrationAuthType | null;
  sapClient: string | null;
  sapLanguage: string | null;
  hasClientSecret: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type IntegrationSettingsRow = {
  id: string;
  organizationId: string;
  cpiBaseUrl: string | null;
  clientId: string | null;
  authType: string | null;
  clientSecretSecretName: string | null;
  clientSecretSecretId: string | null;
  sapClient: string | null;
  sapLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const selectFields = {
  id: organizationIntegrationSettings.id,
  organizationId: organizationIntegrationSettings.organizationId,
  cpiBaseUrl: organizationIntegrationSettings.cpiBaseUrl,
  clientId: organizationIntegrationSettings.clientId,
  authType: organizationIntegrationSettings.authType,
  clientSecretSecretName: organizationIntegrationSettings.clientSecretSecretName,
  clientSecretSecretId: organizationIntegrationSettings.clientSecretSecretId,
  sapClient: organizationIntegrationSettings.sapClient,
  sapLanguage: organizationIntegrationSettings.sapLanguage,
  createdAt: organizationIntegrationSettings.createdAt,
  updatedAt: organizationIntegrationSettings.updatedAt,
};

const DEFAULT_AUTH_TYPE: OrganizationIntegrationAuthType = "oauth2_client_credentials";

function toPublic(
  organizationId: string,
  row: IntegrationSettingsRow | undefined
): OrganizationIntegrationSettingsPublic {
  if (!row) {
    return {
      id: null,
      organizationId,
      cpiBaseUrl: null,
      clientId: null,
      authType: null,
      sapClient: null,
      sapLanguage: null,
      hasClientSecret: false,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    cpiBaseUrl: row.cpiBaseUrl,
    clientId: row.clientId,
    authType: (row.authType as OrganizationIntegrationAuthType | null) ?? null,
    sapClient: row.sapClient,
    sapLanguage: row.sapLanguage,
    hasClientSecret: Boolean(row.clientSecretSecretId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertKeyVaultReady(fastify: FastifyInstance) {
  if (!isKeyVaultConfigured(fastify.env)) {
    throw new AppError("key_vault_error", 503);
  }
}

export async function getOrganizationIntegrationSettings(
  fastify: FastifyInstance,
  organizationId: string
): Promise<OrganizationIntegrationSettingsPublic> {
  const [row] = await fastify.db
    .select(selectFields)
    .from(organizationIntegrationSettings)
    .where(eq(organizationIntegrationSettings.organizationId, organizationId))
    .limit(1);
  return toPublic(organizationId, row);
}

export async function patchOrganizationIntegrationSettings(
  fastify: FastifyInstance,
  organizationId: string,
  input: {
    cpiBaseUrl?: string | null;
    clientId?: string | null;
    clientSecret?: string;
    authType?: OrganizationIntegrationAuthType;
    sapClient?: string | null;
    sapLanguage?: string | null;
  }
): Promise<OrganizationIntegrationSettingsPublic> {
  const existing = await getOrganizationIntegrationSettings(fastify, organizationId);
  const now = new Date();

  let clientSecretSecretName: string | null | undefined;
  let clientSecretSecretId: string | null | undefined;

  if (input.clientSecret !== undefined) {
    if (!input.clientSecret.trim()) {
      throw new AppError("validation_error", 400);
    }
    const resolvedCpiBaseUrl =
      input.cpiBaseUrl !== undefined ? input.cpiBaseUrl : existing.cpiBaseUrl;
    const resolvedClientId = input.clientId !== undefined ? input.clientId : existing.clientId;
    if (!resolvedCpiBaseUrl?.trim() || !resolvedClientId?.trim()) {
      throw new AppError("validation_error", 400);
    }
    assertKeyVaultReady(fastify);
    const secretName = buildCpiClientSecretSecretName(organizationId);
    const kv = createKeyVaultClients(fastify.env);
    try {
      const secretResult = await storeNamedSecret(kv.secretClient, secretName, input.clientSecret);
      clientSecretSecretName = secretResult.name;
      clientSecretSecretId = secretResult.id;
    } catch (e) {
      fastify.log.error({ err: e }, "failed to store CPI client secret");
      throw new AppError("key_vault_error", 503);
    }
  }

  const merged = {
    cpiBaseUrl: input.cpiBaseUrl !== undefined ? input.cpiBaseUrl : existing.cpiBaseUrl,
    clientId: input.clientId !== undefined ? input.clientId : existing.clientId,
    authType:
      input.authType !== undefined
        ? input.authType
        : existing.authType ?? DEFAULT_AUTH_TYPE,
    sapClient: input.sapClient !== undefined ? input.sapClient : existing.sapClient,
    sapLanguage:
      input.sapLanguage !== undefined ? input.sapLanguage : existing.sapLanguage,
  };

  if (existing.id === null) {
    const [inserted] = await fastify.db
      .insert(organizationIntegrationSettings)
      .values({
        organizationId,
        cpiBaseUrl: merged.cpiBaseUrl,
        clientId: merged.clientId,
        authType: merged.authType,
        sapClient: merged.sapClient,
        sapLanguage: merged.sapLanguage,
        ...(clientSecretSecretName !== undefined
          ? {
              clientSecretSecretName,
              clientSecretSecretId,
            }
          : {}),
        createdAt: now,
        updatedAt: now,
      })
      .returning(selectFields);
    if (!inserted) throw new AppError("internal_error", 500);
    return toPublic(organizationId, inserted);
  }

  const [updated] = await fastify.db
    .update(organizationIntegrationSettings)
    .set({
      cpiBaseUrl: merged.cpiBaseUrl,
      clientId: merged.clientId,
      authType: merged.authType,
      sapClient: merged.sapClient,
      sapLanguage: merged.sapLanguage,
      ...(clientSecretSecretName !== undefined
        ? {
            clientSecretSecretName,
            clientSecretSecretId,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(organizationIntegrationSettings.organizationId, organizationId))
    .returning(selectFields);
  if (!updated) throw new AppError("internal_error", 500);
  return toPublic(organizationId, updated);
}
