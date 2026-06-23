import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import {
  organizationCompanies,
  organizationCompanyCertificates,
} from "../../../db/schema.js";
import { createKeyVaultClients, isKeyVaultConfigured } from "../../../integrations/azure/keyvault-clients.js";
import { bestEffortDeleteCertificateResources as deleteKvBundle } from "../../../integrations/azure/certificate-import.js";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "23505"
  );
}

function constraintName(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "constraint" in e) {
    return (e as { constraint?: string }).constraint;
  }
  return undefined;
}

export async function assertCompanyInOrganization(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
) {
  const [row] = await fastify.db
    .select({ id: organizationCompanies.id })
    .from(organizationCompanies)
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.id, companyId)
      )
    )
    .limit(1);
  if (!row) throw new AppError("company_not_found", 404);
}

export async function listOrganizationCompanies(
  fastify: FastifyInstance,
  organizationId: string
) {
  return fastify.db
    .select({
      id: organizationCompanies.id,
      organizationId: organizationCompanies.organizationId,
      cnpj: organizationCompanies.cnpj,
      razaoSocial: organizationCompanies.razaoSocial,
      displayName: organizationCompanies.displayName,
      slug: organizationCompanies.slug,
      csrt: organizationCompanies.csrt,
      hashCsrt: organizationCompanies.hashCsrt,
      createdAt: organizationCompanies.createdAt,
      updatedAt: organizationCompanies.updatedAt,
    })
    .from(organizationCompanies)
    .where(eq(organizationCompanies.organizationId, organizationId))
    .orderBy(organizationCompanies.displayName);
}

export async function getOrganizationCompany(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
) {
  const [row] = await fastify.db
    .select({
      id: organizationCompanies.id,
      organizationId: organizationCompanies.organizationId,
      cnpj: organizationCompanies.cnpj,
      razaoSocial: organizationCompanies.razaoSocial,
      displayName: organizationCompanies.displayName,
      slug: organizationCompanies.slug,
      csrt: organizationCompanies.csrt,
      hashCsrt: organizationCompanies.hashCsrt,
      createdAt: organizationCompanies.createdAt,
      updatedAt: organizationCompanies.updatedAt,
    })
    .from(organizationCompanies)
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.id, companyId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function createOrganizationCompany(
  fastify: FastifyInstance,
  organizationId: string,
  input: {
    cnpj: string;
    razaoSocial: string;
    displayName: string;
    slug: string;
    csrt?: string | null;
    hashCsrt?: string | null;
  }
) {
  try {
    const [row] = await fastify.db
      .insert(organizationCompanies)
      .values({
        organizationId,
        cnpj: input.cnpj,
        razaoSocial: input.razaoSocial,
        displayName: input.displayName,
        slug: input.slug,
        csrt: input.csrt ?? null,
        hashCsrt: input.hashCsrt ?? null,
      })
      .returning({
        id: organizationCompanies.id,
        organizationId: organizationCompanies.organizationId,
        cnpj: organizationCompanies.cnpj,
        razaoSocial: organizationCompanies.razaoSocial,
        displayName: organizationCompanies.displayName,
        slug: organizationCompanies.slug,
        csrt: organizationCompanies.csrt,
        hashCsrt: organizationCompanies.hashCsrt,
        createdAt: organizationCompanies.createdAt,
        updatedAt: organizationCompanies.updatedAt,
      });
    if (!row) throw new AppError("internal_error", 500);
    return row;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      const c = constraintName(e);
      if (c === "organization_companies_org_id_slug_unique") {
        throw new AppError("company_slug_taken", 409);
      }
      throw new AppError("company_cnpj_taken", 409);
    }
    throw e;
  }
}

export async function updateOrganizationCompany(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  input: {
    razaoSocial?: string;
    displayName?: string;
    slug?: string;
    csrt?: string | null;
    hashCsrt?: string | null;
  }
) {
  await assertCompanyInOrganization(fastify, organizationId, companyId);
  const now = new Date();
  const patch: {
    updatedAt: Date;
    razaoSocial?: string;
    displayName?: string;
    slug?: string;
    csrt?: string | null;
    hashCsrt?: string | null;
  } = { updatedAt: now };
  if (input.razaoSocial !== undefined) patch.razaoSocial = input.razaoSocial;
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.csrt !== undefined) patch.csrt = input.csrt;
  if (input.hashCsrt !== undefined) patch.hashCsrt = input.hashCsrt;

  try {
    const [row] = await fastify.db
      .update(organizationCompanies)
      .set(patch)
      .where(
        and(
          eq(organizationCompanies.organizationId, organizationId),
          eq(organizationCompanies.id, companyId)
        )
      )
      .returning({
        id: organizationCompanies.id,
        organizationId: organizationCompanies.organizationId,
        cnpj: organizationCompanies.cnpj,
        razaoSocial: organizationCompanies.razaoSocial,
        displayName: organizationCompanies.displayName,
        slug: organizationCompanies.slug,
        csrt: organizationCompanies.csrt,
        hashCsrt: organizationCompanies.hashCsrt,
        createdAt: organizationCompanies.createdAt,
        updatedAt: organizationCompanies.updatedAt,
      });
    if (!row) throw new AppError("company_not_found", 404);
    return row;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      const c = constraintName(e);
      if (c === "organization_companies_org_id_slug_unique") {
        throw new AppError("company_slug_taken", 409);
      }
      throw new AppError("company_cnpj_taken", 409);
    }
    throw e;
  }
}

async function deleteKeyVaultForCertificateRows(
  fastify: FastifyInstance,
  rows: {
    keyVaultCertName: string;
    passwordSecretName: string;
  }[]
) {
  if (rows.length === 0) return;
  if (!isKeyVaultConfigured(fastify.env)) return;
  const kv = createKeyVaultClients(fastify.env);
  for (const r of rows) {
    await deleteKvBundle({
      certificateClient: kv.certificateClient,
      secretClient: kv.secretClient,
      keyClient: kv.keyClient,
      certificateName: r.keyVaultCertName,
      passwordSecretName: r.passwordSecretName,
    });
  }
}

export async function deleteOrganizationCompany(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
) {
  await assertCompanyInOrganization(fastify, organizationId, companyId);

  const certs = await fastify.db
    .select({
      keyVaultCertName: organizationCompanyCertificates.keyVaultCertName,
      passwordSecretName: organizationCompanyCertificates.passwordSecretName,
    })
    .from(organizationCompanyCertificates)
    .where(eq(organizationCompanyCertificates.organizationCompanyId, companyId));

  await deleteKeyVaultForCertificateRows(fastify, certs);

  await fastify.db
    .delete(organizationCompanies)
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.id, companyId)
      )
    );
}
