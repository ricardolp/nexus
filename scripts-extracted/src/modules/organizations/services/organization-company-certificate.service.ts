import { and, eq, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { AppError } from "../../../common/http/errors.js";
import type { Db } from "../../../db/client.js";
import {
  organizationCompanies,
  organizationCompanyCertificates,
} from "../../../db/schema.js";
import {
  bestEffortDeleteCertificateResources,
  importPfxCertificate,
  mapCertificateToMetadata,
  resolveKeyVaultKeyId,
  rollbackImportedCertificate,
  storePasswordSecret,
} from "../../../integrations/azure/certificate-import.js";
import {
  createKeyVaultClients,
  isKeyVaultConfigured,
} from "../../../integrations/azure/keyvault-clients.js";
import { buildPasswordSecretName, buildVaultCertificateName } from "../../../integrations/azure/vault-names.js";

export type CertificateStatusValue = "active" | "inactive";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

function assertKeyVaultReady(fastify: FastifyInstance) {
  if (!isKeyVaultConfigured(fastify.env)) {
    throw new AppError("key_vault_error", 503);
  }
}

async function deactivateOtherActiveCertificatesForCompany(
  db: Db | DbTransaction,
  companyId: string,
  exceptCertificateId?: string
) {
  const conditions = [
    eq(organizationCompanyCertificates.organizationCompanyId, companyId),
    eq(organizationCompanyCertificates.status, "active"),
  ];
  if (exceptCertificateId) {
    conditions.push(ne(organizationCompanyCertificates.id, exceptCertificateId));
  }
  const now = new Date();
  await db
    .update(organizationCompanyCertificates)
    .set({ status: "inactive", updatedAt: now })
    .where(and(...conditions));
}

async function getCertificateScoped(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  certificateId: string
) {
  const [row] = await fastify.db
    .select({
      id: organizationCompanyCertificates.id,
      organizationCompanyId: organizationCompanyCertificates.organizationCompanyId,
      name: organizationCompanyCertificates.name,
      description: organizationCompanyCertificates.description,
      status: organizationCompanyCertificates.status,
      keyVaultCertName: organizationCompanyCertificates.keyVaultCertName,
      keyVaultCertId: organizationCompanyCertificates.keyVaultCertId,
      keyVaultKeyId: organizationCompanyCertificates.keyVaultKeyId,
      passwordSecretName: organizationCompanyCertificates.passwordSecretName,
      passwordSecretId: organizationCompanyCertificates.passwordSecretId,
      thumbprint: organizationCompanyCertificates.thumbprint,
      subject: organizationCompanyCertificates.subject,
      issuer: organizationCompanyCertificates.issuer,
      expiresAt: organizationCompanyCertificates.expiresAt,
      createdAt: organizationCompanyCertificates.createdAt,
      updatedAt: organizationCompanyCertificates.updatedAt,
    })
    .from(organizationCompanyCertificates)
    .innerJoin(
      organizationCompanies,
      eq(organizationCompanies.id, organizationCompanyCertificates.organizationCompanyId)
    )
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.id, companyId),
        eq(organizationCompanyCertificates.id, certificateId)
      )
    )
    .limit(1);
  return row ?? null;
}

export type CompanyCertificatePublic = {
  id: string;
  organizationCompanyId: string;
  name: string | null;
  description: string | null;
  status: "active" | "inactive" | "expired" | "revoked";
  subject: string | null;
  issuer: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toCertificatePublic(row: CompanyCertificatePublic): CompanyCertificatePublic {
  return {
    id: row.id,
    organizationCompanyId: row.organizationCompanyId,
    name: row.name,
    description: row.description,
    status: row.status,
    subject: row.subject,
    issuer: row.issuer,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listOrganizationCompanyCertificates(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
) {
  const rows = await fastify.db
    .select({
      id: organizationCompanyCertificates.id,
      organizationCompanyId: organizationCompanyCertificates.organizationCompanyId,
      name: organizationCompanyCertificates.name,
      description: organizationCompanyCertificates.description,
      status: organizationCompanyCertificates.status,
      subject: organizationCompanyCertificates.subject,
      issuer: organizationCompanyCertificates.issuer,
      expiresAt: organizationCompanyCertificates.expiresAt,
      createdAt: organizationCompanyCertificates.createdAt,
      updatedAt: organizationCompanyCertificates.updatedAt,
    })
    .from(organizationCompanyCertificates)
    .innerJoin(
      organizationCompanies,
      eq(organizationCompanies.id, organizationCompanyCertificates.organizationCompanyId)
    )
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.id, companyId)
      )
    )
    .orderBy(organizationCompanyCertificates.createdAt);

  return rows.map(toCertificatePublic);
}

export async function getOrganizationCompanyCertificate(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  certificateId: string
) {
  const row = await getCertificateScoped(fastify, organizationId, companyId, certificateId);
  if (!row) return null;
  return toCertificatePublic({
    id: row.id,
    organizationCompanyId: row.organizationCompanyId,
    name: row.name,
    description: row.description,
    status: row.status,
    subject: row.subject,
    issuer: row.issuer,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function uploadOrganizationCompanyCertificate(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  input: {
    pfxBuffer: Buffer;
    password: string;
    name?: string | null;
    description?: string | null;
    status?: CertificateStatusValue;
  }
) {
  assertKeyVaultReady(fastify);

  const [company] = await fastify.db
    .select({ id: organizationCompanies.id })
    .from(organizationCompanies)
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.id, companyId)
      )
    )
    .limit(1);
  if (!company) throw new AppError("company_not_found", 404);

  const certificateId = randomUUID();
  const vaultCertName = buildVaultCertificateName(organizationId, companyId, certificateId);
  const passwordSecretName = buildPasswordSecretName(vaultCertName);
  const kv = createKeyVaultClients(fastify.env);

  let imported: Awaited<ReturnType<typeof importPfxCertificate>> | null = null;
  try {
    imported = await importPfxCertificate({
      certificateClient: kv.certificateClient,
      certificateName: vaultCertName,
      pfxBytes: input.pfxBuffer,
      password: input.password,
    });
  } catch (e: unknown) {
    fastify.log.error({ err: e, organizationId, companyId }, "certificate import to Key Vault failed");
    throw new AppError("certificate_upload_error", 400, { cause: e });
  }

  const meta = mapCertificateToMetadata(imported, kv.vaultUrl);
  let keyVaultKeyId: string | null = null;
  try {
    keyVaultKeyId = await resolveKeyVaultKeyId(kv.keyClient, vaultCertName);
  } catch (e: unknown) {
    fastify.log.warn({ err: e, vaultCertName }, "could not resolve key id after certificate import");
  }

  let secretResult: { name: string; id: string | null };
  try {
    secretResult = await storePasswordSecret(kv.secretClient, vaultCertName, input.password);
  } catch (e: unknown) {
    fastify.log.error({ err: e }, "failed to store certificate password secret");
    await rollbackImportedCertificate({
      certificateClient: kv.certificateClient,
      secretClient: kv.secretClient,
      keyClient: kv.keyClient,
      certificateName: vaultCertName,
      passwordSecretName,
    });
    throw new AppError("certificate_upload_error", 400, { cause: e });
  }

  const status = input.status ?? "active";
  try {
    const saved = await fastify.db.transaction(async (tx) => {
      if (status === "active") {
        await deactivateOtherActiveCertificatesForCompany(tx, companyId);
      }
      const [inserted] = await tx
        .insert(organizationCompanyCertificates)
        .values({
          id: certificateId,
          organizationCompanyId: companyId,
          name: input.name ?? meta.keyVaultCertName ?? null,
          description: input.description ?? null,
          status,
          keyVaultCertName: meta.keyVaultCertName,
          keyVaultCertId: meta.keyVaultCertId,
          keyVaultKeyId,
          passwordSecretName: secretResult.name,
          passwordSecretId: secretResult.id,
          thumbprint: meta.thumbprint,
          subject: meta.subject,
          issuer: meta.issuer,
          expiresAt: meta.expiresAt,
        })
        .returning({
          id: organizationCompanyCertificates.id,
          organizationCompanyId: organizationCompanyCertificates.organizationCompanyId,
          name: organizationCompanyCertificates.name,
          description: organizationCompanyCertificates.description,
          status: organizationCompanyCertificates.status,
          subject: organizationCompanyCertificates.subject,
          issuer: organizationCompanyCertificates.issuer,
          expiresAt: organizationCompanyCertificates.expiresAt,
          createdAt: organizationCompanyCertificates.createdAt,
          updatedAt: organizationCompanyCertificates.updatedAt,
        });
      return inserted;
    });

    if (!saved) throw new AppError("internal_error", 500);
    return toCertificatePublic(saved);
  } catch (e: unknown) {
    await bestEffortDeleteCertificateResources({
      certificateClient: kv.certificateClient,
      secretClient: kv.secretClient,
      keyClient: kv.keyClient,
      certificateName: vaultCertName,
      passwordSecretName,
    });
    throw e;
  }
}

export async function updateOrganizationCompanyCertificate(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  certificateId: string,
  input: {
    name?: string | null;
    description?: string | null;
    status?: CertificateStatusValue;
  }
) {
  const existing = await getCertificateScoped(
    fastify,
    organizationId,
    companyId,
    certificateId
  );
  if (!existing) throw new AppError("certificate_not_found", 404);

  const now = new Date();
  const patch: {
    updatedAt: Date;
    name?: string | null;
    description?: string | null;
    status?: "active" | "inactive";
  } = { updatedAt: now };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.status !== undefined) patch.status = input.status;

  const row = await fastify.db.transaction(async (tx) => {
    if (input.status === "active") {
      await deactivateOtherActiveCertificatesForCompany(tx, companyId, certificateId);
    }
    const [updated] = await tx
      .update(organizationCompanyCertificates)
      .set(patch)
      .where(eq(organizationCompanyCertificates.id, certificateId))
      .returning({
        id: organizationCompanyCertificates.id,
        organizationCompanyId: organizationCompanyCertificates.organizationCompanyId,
        name: organizationCompanyCertificates.name,
        description: organizationCompanyCertificates.description,
        status: organizationCompanyCertificates.status,
        subject: organizationCompanyCertificates.subject,
        issuer: organizationCompanyCertificates.issuer,
        expiresAt: organizationCompanyCertificates.expiresAt,
        createdAt: organizationCompanyCertificates.createdAt,
        updatedAt: organizationCompanyCertificates.updatedAt,
      });
    return updated;
  });
  if (!row) throw new AppError("certificate_not_found", 404);
  return toCertificatePublic(row);
}

export async function deleteOrganizationCompanyCertificate(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  certificateId: string
) {
  const existing = await getCertificateScoped(
    fastify,
    organizationId,
    companyId,
    certificateId
  );
  if (!existing) throw new AppError("certificate_not_found", 404);

  if (isKeyVaultConfigured(fastify.env)) {
    const kv = createKeyVaultClients(fastify.env);
    await bestEffortDeleteCertificateResources({
      certificateClient: kv.certificateClient,
      secretClient: kv.secretClient,
      keyClient: kv.keyClient,
      certificateName: existing.keyVaultCertName,
      passwordSecretName: existing.passwordSecretName,
    });
  }

  await fastify.db
    .delete(organizationCompanyCertificates)
    .where(eq(organizationCompanyCertificates.id, certificateId));
}
