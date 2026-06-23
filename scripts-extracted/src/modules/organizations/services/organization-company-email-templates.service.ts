import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { organizationCompanyEmailTemplates } from "../../../db/schema.js";
import { assertCompanyInOrganization } from "./organization-company.service.js";

export type CompanyEmailTemplateType =
  | "nfe_issued"
  | "nfe_cancelled"
  | "nfe_cce"
  | "nfe_rejected";

export const COMPANY_EMAIL_TEMPLATE_TYPES: readonly CompanyEmailTemplateType[] = [
  "nfe_issued",
  "nfe_cancelled",
  "nfe_cce",
  "nfe_rejected",
] as const;

const templateTypeFromUrl: Record<string, CompanyEmailTemplateType> = {
  "nfe-issued": "nfe_issued",
  "nfe-cancelled": "nfe_cancelled",
  "nfe-cce": "nfe_cce",
  "nfe-rejected": "nfe_rejected",
};

export function parseCompanyEmailTemplateTypeFromUrl(urlSegment: string): CompanyEmailTemplateType {
  const type = templateTypeFromUrl[urlSegment];
  if (!type) throw new AppError("invalid_email_template_type", 400);
  return type;
}

export type OrganizationCompanyEmailTemplatePublic = {
  id: string | null;
  organizationCompanyId: string;
  templateType: CompanyEmailTemplateType;
  subject: string | null;
  bodyHtml: string | null;
  configured: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const selectFields = {
  id: organizationCompanyEmailTemplates.id,
  organizationCompanyId: organizationCompanyEmailTemplates.organizationCompanyId,
  templateType: organizationCompanyEmailTemplates.templateType,
  subject: organizationCompanyEmailTemplates.subject,
  bodyHtml: organizationCompanyEmailTemplates.bodyHtml,
  createdAt: organizationCompanyEmailTemplates.createdAt,
  updatedAt: organizationCompanyEmailTemplates.updatedAt,
};

type TemplateRow = {
  id: string;
  organizationCompanyId: string;
  templateType: CompanyEmailTemplateType;
  subject: string | null;
  bodyHtml: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(
  companyId: string,
  templateType: CompanyEmailTemplateType,
  row: TemplateRow | undefined
): OrganizationCompanyEmailTemplatePublic {
  if (!row) {
    return {
      id: null,
      organizationCompanyId: companyId,
      templateType,
      subject: null,
      bodyHtml: null,
      configured: false,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    organizationCompanyId: row.organizationCompanyId,
    templateType: row.templateType,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    configured: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listOrganizationCompanyEmailTemplates(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
): Promise<OrganizationCompanyEmailTemplatePublic[]> {
  await assertCompanyInOrganization(fastify, organizationId, companyId);
  const rows = await fastify.db
    .select(selectFields)
    .from(organizationCompanyEmailTemplates)
    .where(eq(organizationCompanyEmailTemplates.organizationCompanyId, companyId));

  const byType = new Map(rows.map((r) => [r.templateType, r]));
  return COMPANY_EMAIL_TEMPLATE_TYPES.map((templateType) =>
    toPublic(companyId, templateType, byType.get(templateType))
  );
}

export async function getOrganizationCompanyEmailTemplate(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  templateType: CompanyEmailTemplateType
): Promise<OrganizationCompanyEmailTemplatePublic> {
  await assertCompanyInOrganization(fastify, organizationId, companyId);
  const [row] = await fastify.db
    .select(selectFields)
    .from(organizationCompanyEmailTemplates)
    .where(
      and(
        eq(organizationCompanyEmailTemplates.organizationCompanyId, companyId),
        eq(organizationCompanyEmailTemplates.templateType, templateType)
      )
    )
    .limit(1);
  return toPublic(companyId, templateType, row);
}

export async function patchOrganizationCompanyEmailTemplate(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  templateType: CompanyEmailTemplateType,
  input: {
    subject?: string | null;
    bodyHtml?: string | null;
  }
): Promise<OrganizationCompanyEmailTemplatePublic> {
  const existing = await getOrganizationCompanyEmailTemplate(
    fastify,
    organizationId,
    companyId,
    templateType
  );
  const now = new Date();

  const merged = {
    subject: input.subject !== undefined ? input.subject : existing.subject,
    bodyHtml: input.bodyHtml !== undefined ? input.bodyHtml : existing.bodyHtml,
  };

  if (existing.id === null) {
    const [inserted] = await fastify.db
      .insert(organizationCompanyEmailTemplates)
      .values({
        organizationCompanyId: companyId,
        templateType,
        subject: merged.subject,
        bodyHtml: merged.bodyHtml,
        createdAt: now,
        updatedAt: now,
      })
      .returning(selectFields);
    if (!inserted) throw new AppError("internal_error", 500);
    return toPublic(companyId, templateType, inserted);
  }

  const [updated] = await fastify.db
    .update(organizationCompanyEmailTemplates)
    .set({
      subject: merged.subject,
      bodyHtml: merged.bodyHtml,
      updatedAt: now,
    })
    .where(
      and(
        eq(organizationCompanyEmailTemplates.organizationCompanyId, companyId),
        eq(organizationCompanyEmailTemplates.templateType, templateType)
      )
    )
    .returning(selectFields);
  if (!updated) throw new AppError("internal_error", 500);
  return toPublic(companyId, templateType, updated);
}
