import { z } from "zod";

export const organizationIdParamSchema = z.object({
  organizationId: z.string().uuid(),
});

export const companyIdParamSchema = organizationIdParamSchema.extend({
  companyId: z.string().uuid(),
});

export const companyCertificateParamSchema = companyIdParamSchema.extend({
  certificateId: z.string().uuid(),
});

export const companyEmailTemplateParamSchema = companyIdParamSchema.extend({
  templateType: z.enum(["nfe-issued", "nfe-cancelled", "nfe-cce", "nfe-rejected"]),
});

export const organizationRoleIdParamSchema = organizationIdParamSchema.extend({
  roleId: z.string().uuid(),
});

export const organizationMemberIdParamSchema = organizationIdParamSchema.extend({
  memberId: z.string().uuid(),
});

const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid_slug");

const cnpjDigitsSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .pipe(z.string().length(14));

export const createOrganizationCompanyBodySchema = z.object({
  cnpj: cnpjDigitsSchema,
  razaoSocial: z.string().min(1).max(300),
  displayName: z.string().min(1).max(255),
  slug: slugSchema,
  csrt: z.string().max(4000).optional().nullable(),
  hashCsrt: z.string().max(128).optional().nullable(),
});

export const updateOrganizationCompanyBodySchema = z.object({
  razaoSocial: z.string().min(1).max(300).optional(),
  displayName: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  csrt: z.string().max(4000).nullable().optional(),
  hashCsrt: z.string().max(128).nullable().optional(),
});

const certificateStatusSchema = z.enum(["active", "inactive"]);

export const updateOrganizationCompanyCertificateBodySchema = z.object({
  name: z.string().min(1).max(255).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  status: certificateStatusSchema.optional(),
});

export const patchOrganizationCompanySettingsBodySchema = z
  .object({
    isNfseInboundActive: z.boolean().optional(),
    isNfseOutboundActive: z.boolean().optional(),
    isNfeInboundActive: z.boolean().optional(),
    isNfeOutboundActive: z.boolean().optional(),
    sendDanfeToApproveOutbound: z.boolean().optional(),
    sendXmlToApproveOutbound: z.boolean().optional(),
    sendXmlToCancelOutbound: z.boolean().optional(),
    sendXmlToCceOutbound: z.boolean().optional(),
  })
  .strict();

const smtpEncryptionSchema = z.enum(["none", "tls", "ssl"]);

export const patchOrganizationCompanyEmailSettingsBodySchema = z
  .object({
    smtpHost: z.string().max(255).nullable().optional(),
    smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
    smtpUsername: z.string().max(255).nullable().optional(),
    smtpPassword: z.string().min(1).max(512).optional(),
    smtpEncryption: smtpEncryptionSchema.nullable().optional(),
    fromEmail: z.string().email().max(320).nullable().optional(),
    fromName: z.string().max(255).nullable().optional(),
  })
  .strict();

export const patchOrganizationCompanyEmailTemplateBodySchema = z
  .object({
    subject: z.string().max(500).nullable().optional(),
    bodyHtml: z.string().max(100_000).nullable().optional(),
  })
  .strict()
  .refine((data) => data.subject !== undefined || data.bodyHtml !== undefined, {
    message: "At least one of subject or bodyHtml is required",
  });

export const createOrganizationBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  firstMemberUserId: z.string().uuid().optional(),
});

export const createOrganizationRoleBodySchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(4000).optional(),
  scopes: z.array(z.string().min(1).max(128)).optional().default([]),
});

export const updateOrganizationRoleBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(4000).nullable().optional(),
  scopes: z.array(z.string().min(1).max(128)).optional(),
});

export const addOrganizationMemberBodySchema = z.object({
  userId: z.string().uuid(),
  organizationRoleId: z.string().uuid(),
});

export const createOrganizationUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(255).optional(),
});

export const updateOrganizationMemberRoleBodySchema = z.object({
  organizationRoleId: z.string().uuid(),
});

const organizationIntegrationAuthTypeSchema = z.literal("oauth2_client_credentials");

export const integrationLogIdParamSchema = organizationIdParamSchema.extend({
  logId: z.string().uuid(),
});

export const listIntegrationLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  operation: z.enum(["purchase_orders", "inbound_delivery"]).optional(),
  success: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  nfeDocumentId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const patchOrganizationIntegrationSettingsBodySchema = z
  .object({
    cpiBaseUrl: z.string().url().max(2048).nullable().optional(),
    clientId: z.string().min(1).max(255).nullable().optional(),
    clientSecret: z.string().min(1).max(512).optional(),
    authType: organizationIntegrationAuthTypeSchema.optional(),
    sapClient: z
      .string()
      .regex(/^\d{1,3}$/, "sapClient must be 1-3 digits")
      .nullable()
      .optional(),
    sapLanguage: z.string().min(2).max(5).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.clientSecret === undefined) return true;
      const hasUrl = data.cpiBaseUrl !== undefined && data.cpiBaseUrl !== null;
      const hasClientId = data.clientId !== undefined && data.clientId !== null;
      return hasUrl && hasClientId;
    },
    {
      message: "cpiBaseUrl and clientId are required when clientSecret is provided",
    }
  );
