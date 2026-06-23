import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { organizationCompanyEmailsSettings } from "../../../db/schema.js";
import { storeNamedSecret } from "../../../integrations/azure/certificate-import.js";
import {
  createKeyVaultClients,
  isKeyVaultConfigured,
} from "../../../integrations/azure/keyvault-clients.js";
import { buildSmtpPasswordSecretName } from "../../../integrations/azure/vault-names.js";
import { assertCompanyInOrganization } from "./organization-company.service.js";

export type SmtpEncryption = "none" | "tls" | "ssl";

export type OrganizationCompanyEmailSettingsPublic = {
  id: string | null;
  organizationCompanyId: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpEncryption: SmtpEncryption | null;
  fromEmail: string | null;
  fromName: string | null;
  hasSmtpPassword: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type EmailSettingsRow = {
  id: string;
  organizationCompanyId: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordSecretName: string | null;
  smtpPasswordSecretId: string | null;
  smtpEncryption: string | null;
  fromEmail: string | null;
  fromName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const selectFields = {
  id: organizationCompanyEmailsSettings.id,
  organizationCompanyId: organizationCompanyEmailsSettings.organizationCompanyId,
  smtpHost: organizationCompanyEmailsSettings.smtpHost,
  smtpPort: organizationCompanyEmailsSettings.smtpPort,
  smtpUsername: organizationCompanyEmailsSettings.smtpUsername,
  smtpPasswordSecretName: organizationCompanyEmailsSettings.smtpPasswordSecretName,
  smtpPasswordSecretId: organizationCompanyEmailsSettings.smtpPasswordSecretId,
  smtpEncryption: organizationCompanyEmailsSettings.smtpEncryption,
  fromEmail: organizationCompanyEmailsSettings.fromEmail,
  fromName: organizationCompanyEmailsSettings.fromName,
  createdAt: organizationCompanyEmailsSettings.createdAt,
  updatedAt: organizationCompanyEmailsSettings.updatedAt,
};

function toPublic(
  companyId: string,
  row: EmailSettingsRow | undefined
): OrganizationCompanyEmailSettingsPublic {
  if (!row) {
    return {
      id: null,
      organizationCompanyId: companyId,
      smtpHost: null,
      smtpPort: null,
      smtpUsername: null,
      smtpEncryption: null,
      fromEmail: null,
      fromName: null,
      hasSmtpPassword: false,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    organizationCompanyId: row.organizationCompanyId,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUsername: row.smtpUsername,
    smtpEncryption: (row.smtpEncryption as SmtpEncryption | null) ?? null,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    hasSmtpPassword: Boolean(row.smtpPasswordSecretId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertKeyVaultReady(fastify: FastifyInstance) {
  if (!isKeyVaultConfigured(fastify.env)) {
    throw new AppError("key_vault_error", 503);
  }
}

export async function getOrganizationCompanyEmailSettings(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
): Promise<OrganizationCompanyEmailSettingsPublic> {
  await assertCompanyInOrganization(fastify, organizationId, companyId);
  const [row] = await fastify.db
    .select(selectFields)
    .from(organizationCompanyEmailsSettings)
    .where(eq(organizationCompanyEmailsSettings.organizationCompanyId, companyId))
    .limit(1);
  return toPublic(companyId, row);
}

export async function patchOrganizationCompanyEmailSettings(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  input: {
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpUsername?: string | null;
    smtpPassword?: string;
    smtpEncryption?: SmtpEncryption | null;
    fromEmail?: string | null;
    fromName?: string | null;
  }
): Promise<OrganizationCompanyEmailSettingsPublic> {
  const existing = await getOrganizationCompanyEmailSettings(fastify, organizationId, companyId);
  const now = new Date();

  let smtpPasswordSecretName: string | null | undefined;
  let smtpPasswordSecretId: string | null | undefined;

  if (input.smtpPassword !== undefined) {
    if (!input.smtpPassword.trim()) {
      throw new AppError("validation_error", 400);
    }
    assertKeyVaultReady(fastify);
    const secretName = buildSmtpPasswordSecretName(organizationId, companyId);
    const kv = createKeyVaultClients(fastify.env);
    try {
      const secretResult = await storeNamedSecret(kv.secretClient, secretName, input.smtpPassword);
      smtpPasswordSecretName = secretResult.name;
      smtpPasswordSecretId = secretResult.id;
    } catch (e) {
      fastify.log.error({ err: e }, "failed to store SMTP password secret");
      throw new AppError("key_vault_error", 503);
    }
  }

  const merged = {
    smtpHost: input.smtpHost !== undefined ? input.smtpHost : existing.smtpHost,
    smtpPort: input.smtpPort !== undefined ? input.smtpPort : existing.smtpPort,
    smtpUsername: input.smtpUsername !== undefined ? input.smtpUsername : existing.smtpUsername,
    smtpEncryption:
      input.smtpEncryption !== undefined ? input.smtpEncryption : existing.smtpEncryption,
    fromEmail: input.fromEmail !== undefined ? input.fromEmail : existing.fromEmail,
    fromName: input.fromName !== undefined ? input.fromName : existing.fromName,
  };

  if (existing.id === null) {
    const [inserted] = await fastify.db
      .insert(organizationCompanyEmailsSettings)
      .values({
        organizationCompanyId: companyId,
        smtpHost: merged.smtpHost,
        smtpPort: merged.smtpPort,
        smtpUsername: merged.smtpUsername,
        smtpEncryption: merged.smtpEncryption,
        fromEmail: merged.fromEmail,
        fromName: merged.fromName,
        ...(smtpPasswordSecretName !== undefined
          ? {
              smtpPasswordSecretName,
              smtpPasswordSecretId,
            }
          : {}),
        createdAt: now,
        updatedAt: now,
      })
      .returning(selectFields);
    if (!inserted) throw new AppError("internal_error", 500);
    return toPublic(companyId, inserted);
  }

  const [updated] = await fastify.db
    .update(organizationCompanyEmailsSettings)
    .set({
      smtpHost: merged.smtpHost,
      smtpPort: merged.smtpPort,
      smtpUsername: merged.smtpUsername,
      smtpEncryption: merged.smtpEncryption,
      fromEmail: merged.fromEmail,
      fromName: merged.fromName,
      ...(smtpPasswordSecretName !== undefined
        ? {
            smtpPasswordSecretName,
            smtpPasswordSecretId,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(organizationCompanyEmailsSettings.organizationCompanyId, companyId))
    .returning(selectFields);
  if (!updated) throw new AppError("internal_error", 500);
  return toPublic(companyId, updated);
}
