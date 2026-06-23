import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { sendSuccess } from "../../../common/http/responses.js";
import { z } from "zod";
import {
  companyCertificateParamSchema,
  companyEmailTemplateParamSchema,
  companyIdParamSchema,
  createOrganizationCompanyBodySchema,
  patchOrganizationCompanyEmailSettingsBodySchema,
  patchOrganizationCompanyEmailTemplateBodySchema,
  patchOrganizationCompanySettingsBodySchema,
  updateOrganizationCompanyBodySchema,
  updateOrganizationCompanyCertificateBodySchema,
} from "../schemas.js";
import {
  createOrganizationCompany,
  deleteOrganizationCompany,
  getOrganizationCompany,
  listOrganizationCompanies,
  updateOrganizationCompany,
} from "../services/organization-company.service.js";
import {
  deleteOrganizationCompanyCertificate,
  getOrganizationCompanyCertificate,
  listOrganizationCompanyCertificates,
  updateOrganizationCompanyCertificate,
  uploadOrganizationCompanyCertificate,
} from "../services/organization-company-certificate.service.js";
import {
  getOrganizationCompanyEmailSettings,
  patchOrganizationCompanyEmailSettings,
} from "../services/organization-company-email-settings.service.js";
import {
  getOrganizationCompanyEmailTemplate,
  listOrganizationCompanyEmailTemplates,
  parseCompanyEmailTemplateTypeFromUrl,
  patchOrganizationCompanyEmailTemplate,
} from "../services/organization-company-email-templates.service.js";
import {
  getOrganizationCompanySettings,
  patchOrganizationCompanySettings,
} from "../services/organization-company-settings.service.js";

export async function listCompaniesHandler(request: FastifyRequest, reply: FastifyReply) {
  const organizationId = request.organizationContext!.organizationId;
  const rows = await listOrganizationCompanies(request.server, organizationId);
  return sendSuccess(reply, { companies: rows });
}

export async function createCompanyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof createOrganizationCompanyBodySchema.parse>
) {
  const organizationId = request.organizationContext!.organizationId;
  const row = await createOrganizationCompany(request.server, organizationId, {
    cnpj: body.cnpj,
    razaoSocial: body.razaoSocial.trim(),
    displayName: body.displayName.trim(),
    slug: body.slug,
    csrt: body.csrt,
    hashCsrt: body.hashCsrt,
  });
  return sendSuccess(reply, { company: row }, 201);
}

export async function getCompanyHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const row = await getOrganizationCompany(request.server, organizationId, companyId);
  if (!row) throw new AppError("company_not_found", 404);
  return sendSuccess(reply, { company: row });
}

export async function updateCompanyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof updateOrganizationCompanyBodySchema.parse>
) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const row = await updateOrganizationCompany(request.server, organizationId, companyId, {
    razaoSocial: body.razaoSocial?.trim(),
    displayName: body.displayName?.trim(),
    slug: body.slug,
    csrt: body.csrt,
    hashCsrt: body.hashCsrt,
  });
  return sendSuccess(reply, { company: row });
}

export async function deleteCompanyHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  await deleteOrganizationCompany(request.server, organizationId, companyId);
  return sendSuccess(reply, { ok: true });
}

export async function getCompanySettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const settings = await getOrganizationCompanySettings(request.server, organizationId, companyId);
  return sendSuccess(reply, { settings });
}

export async function patchCompanySettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof patchOrganizationCompanySettingsBodySchema.parse>
) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const settings = await patchOrganizationCompanySettings(
    request.server,
    organizationId,
    companyId,
    body
  );
  return sendSuccess(reply, { settings });
}

export async function getCompanyEmailSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const emailSettings = await getOrganizationCompanyEmailSettings(
    request.server,
    organizationId,
    companyId
  );
  return sendSuccess(reply, { emailSettings });
}

export async function patchCompanyEmailSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof patchOrganizationCompanyEmailSettingsBodySchema.parse>
) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const emailSettings = await patchOrganizationCompanyEmailSettings(
    request.server,
    organizationId,
    companyId,
    body
  );
  return sendSuccess(reply, { emailSettings });
}

export async function listCompanyEmailTemplatesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const templates = await listOrganizationCompanyEmailTemplates(
    request.server,
    organizationId,
    companyId
  );
  return sendSuccess(reply, { templates });
}

export async function getCompanyEmailTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyEmailTemplateParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId, templateType: templateTypeUrl } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const templateType = parseCompanyEmailTemplateTypeFromUrl(templateTypeUrl);
  const template = await getOrganizationCompanyEmailTemplate(
    request.server,
    organizationId,
    companyId,
    templateType
  );
  return sendSuccess(reply, { template });
}

export async function patchCompanyEmailTemplateHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof patchOrganizationCompanyEmailTemplateBodySchema.parse>
) {
  const params = companyEmailTemplateParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId, templateType: templateTypeUrl } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const templateType = parseCompanyEmailTemplateTypeFromUrl(templateTypeUrl);
  const template = await patchOrganizationCompanyEmailTemplate(
    request.server,
    organizationId,
    companyId,
    templateType,
    body
  );
  return sendSuccess(reply, { template });
}

export async function listCertificatesHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const rows = await listOrganizationCompanyCertificates(request.server, organizationId, companyId);
  return sendSuccess(reply, { certificates: rows });
}

export async function uploadCertificateHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyIdParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }

  let fileBuf: Buffer | null = null;
  const fields: Record<string, string> = {};
  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuf = await part.toBuffer();
      const fname = part.filename?.toLowerCase() ?? "";
      if (!fname.endsWith(".pfx") && !fname.endsWith(".p12")) {
        throw new AppError("certificate_file_invalid", 400);
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  if (!fileBuf || fileBuf.length === 0) {
    throw new AppError("certificate_upload_error", 400);
  }

  const password = fields.password?.trim() ?? "";
  if (!password) throw new AppError("certificate_password_required", 400);

  const uploadFieldsSchema = z.object({
    name: z.string().max(255).optional(),
    description: z.string().max(4000).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  });
  const meta = uploadFieldsSchema.safeParse({
    name: fields.name?.trim() || undefined,
    description: fields.description?.trim(),
    status:
      fields.status === "active" || fields.status === "inactive" ? fields.status : undefined,
  });
  if (!meta.success) throw meta.error;

  const row = await uploadOrganizationCompanyCertificate(request.server, organizationId, companyId, {
    pfxBuffer: fileBuf,
    password,
    name: meta.data.name,
    description: meta.data.description,
    status: meta.data.status,
  });
  return sendSuccess(reply, { certificate: row }, 201);
}

export async function getCertificateHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyCertificateParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId, certificateId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const row = await getOrganizationCompanyCertificate(
    request.server,
    organizationId,
    companyId,
    certificateId
  );
  if (!row) throw new AppError("certificate_not_found", 404);
  return sendSuccess(reply, { certificate: row });
}

export async function updateCertificateHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof updateOrganizationCompanyCertificateBodySchema.parse>
) {
  const params = companyCertificateParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId, certificateId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const row = await updateOrganizationCompanyCertificate(
    request.server,
    organizationId,
    companyId,
    certificateId,
    body
  );
  return sendSuccess(reply, { certificate: row });
}

export async function deleteCertificateHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = companyCertificateParamSchema.safeParse(request.params);
  if (!params.success) throw params.error;
  const { organizationId, companyId, certificateId } = params.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  await deleteOrganizationCompanyCertificate(
    request.server,
    organizationId,
    companyId,
    certificateId
  );
  return sendSuccess(reply, { ok: true });
}
