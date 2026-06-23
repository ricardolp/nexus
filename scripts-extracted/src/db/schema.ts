import { eq, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { NotificationAction } from "../modules/notifications/types.js";

export const emailSendStatusEnum = pgEnum("email_send_status", [
  "queued",
  "processing",
  "retrying",
  "sent",
  "failed",
]);

export const userRoleEnum = pgEnum("user_role", ["member", "admin"]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "blocked",
]);

export const certificateStatusEnum = pgEnum("certificate_status", [
  "active",
  "inactive",
  "expired",
  "revoked",
]);

export const companyEmailTemplateTypeEnum = pgEnum("company_email_template_type", [
  "nfe_issued",
  "nfe_cancelled",
  "nfe_cce",
  "nfe_rejected",
]);

export const organizationIntegrationAuthTypeEnum = pgEnum("organization_integration_auth_type", [
  "oauth2_client_credentials",
]);

export const integrationProviderEnum = pgEnum("integration_provider", ["sap_cpi"]);

export const integrationOperationEnum = pgEnum("integration_operation", [
  "purchase_orders",
  "inbound_delivery",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  avatar: varchar("avatar", { length: 2048 }),
  phoneNumber: varchar("phone_number", { length: 32 }),
  role: userRoleEnum("role").notNull().default("member"),
  status: userStatusEnum("status").notNull().default("active"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  onboardingAt: timestamp("onboarding_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
  })
);

export const emailConfirmationTokens = pgTable(
  "email_confirmation_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("email_confirmation_tokens_user_id_idx").on(table.userId),
  })
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 45 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    userIdRevokedIdx: index("user_sessions_user_id_revoked_at_idx").on(
      table.userId,
      table.revokedAt
    ),
  })
);

export const emailSendLogs = pgTable(
  "email_send_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    subject: varchar("subject", { length: 512 }).notNull(),
    template: varchar("template", { length: 64 }).notNull(),
    status: emailSendStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusCreatedIdx: index("email_send_logs_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  })
);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationRoles = pgTable(
  "organization_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex("organization_roles_org_id_name_unique").on(
      table.organizationId,
      table.name
    ),
    organizationIdIdx: index("organization_roles_organization_id_idx").on(
      table.organizationId
    ),
  })
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizationRoleId: uuid("organization_role_id")
      .notNull()
      .references(() => organizationRoles.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdUnique: uniqueIndex("organization_members_user_id_unique").on(table.userId),
    organizationIdIdx: index("organization_members_organization_id_idx").on(
      table.organizationId
    ),
    organizationRoleIdIdx: index("organization_members_organization_role_id_idx").on(
      table.organizationRoleId
    ),
  })
);

export const integrationRequestLogs = pgTable(
  "integration_request_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nfeDocumentId: uuid("nfe_document_id"),
    provider: integrationProviderEnum("provider").notNull(),
    operation: integrationOperationEnum("operation").notNull(),
    httpMethod: varchar("http_method", { length: 8 }).notNull(),
    requestUrl: text("request_url").notNull(),
    requestBody: jsonb("request_body"),
    responseBody: jsonb("response_body"),
    responseStatus: integer("response_status"),
    durationMs: integer("duration_ms").notNull(),
    success: boolean("success").notNull(),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    correlationId: varchar("correlation_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedAtIdx: index("integration_request_logs_org_created_at_idx").on(
      table.organizationId,
      table.createdAt
    ),
    nfeDocumentIdIdx: index("integration_request_logs_nfe_document_id_idx").on(
      table.nfeDocumentId
    ),
    orgOperationCreatedAtIdx: index("integration_request_logs_org_operation_created_at_idx").on(
      table.organizationId,
      table.operation,
      table.createdAt
    ),
  })
);

export const organizationIntegrationSettings = pgTable(
  "organization_integration_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cpiBaseUrl: varchar("cpi_base_url", { length: 2048 }),
    clientId: varchar("client_id", { length: 255 }),
    authType: organizationIntegrationAuthTypeEnum("auth_type"),
    clientSecretSecretName: varchar("client_secret_secret_name", { length: 255 }),
    clientSecretSecretId: text("client_secret_secret_id"),
    sapClient: varchar("sap_client", { length: 3 }),
    sapLanguage: varchar("sap_language", { length: 5 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    organizationIdUnique: uniqueIndex(
      "organization_integration_settings_organization_id_unique"
    ).on(table.organizationId),
  })
);

export const organizationCompanies = pgTable(
  "organization_companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cnpj: varchar("cnpj", { length: 14 }).notNull(),
    razaoSocial: varchar("razao_social", { length: 300 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    csrt: text("csrt"),
    hashCsrt: varchar("hash_csrt", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgCnpjUnique: uniqueIndex("organization_companies_org_id_cnpj_unique").on(
      table.organizationId,
      table.cnpj
    ),
    orgSlugUnique: uniqueIndex("organization_companies_org_id_slug_unique").on(
      table.organizationId,
      table.slug
    ),
    organizationIdIdx: index("organization_companies_organization_id_idx").on(
      table.organizationId
    ),
  })
);

export const organizationCompanyEmailsSettings = pgTable(
  "organization_company_emails_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    smtpHost: varchar("smtp_host", { length: 255 }),
    smtpPort: integer("smtp_port"),
    smtpUsername: varchar("smtp_username", { length: 255 }),
    smtpPasswordSecretName: varchar("smtp_password_secret_name", { length: 255 }),
    smtpPasswordSecretId: text("smtp_password_secret_id"),
    smtpEncryption: varchar("smtp_encryption", { length: 32 }),
    fromEmail: varchar("from_email", { length: 320 }),
    fromName: varchar("from_name", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    organizationCompanyIdUnique: uniqueIndex(
      "organization_company_emails_settings_company_id_unique"
    ).on(table.organizationCompanyId),
  })
);

export const organizationCompanyEmailTemplates = pgTable(
  "organization_company_email_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    templateType: companyEmailTemplateTypeEnum("template_type").notNull(),
    subject: varchar("subject", { length: 500 }),
    bodyHtml: text("body_html"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyTemplateTypeUnique: uniqueIndex(
      "organization_company_email_templates_company_id_type_unique"
    ).on(table.organizationCompanyId, table.templateType),
    organizationCompanyIdIdx: index("organization_company_email_templates_company_id_idx").on(
      table.organizationCompanyId
    ),
  })
);

export const organizationCompanySettings = pgTable(
  "organization_company_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    isNfseInboundActive: boolean("is_nfse_inbound_active").notNull().default(false),
    isNfseOutboundActive: boolean("is_nfse_outbound_active").notNull().default(false),
    isNfeInboundActive: boolean("is_nfe_inbound_active").notNull().default(false),
    isNfeOutboundActive: boolean("is_nfe_outbound_active").notNull().default(false),
    sendDanfeToApproveOutbound: boolean("send_danfe_to_approve_outbound")
      .notNull()
      .default(false),
    sendXmlToApproveOutbound: boolean("send_xml_to_approve_outbound")
      .notNull()
      .default(false),
    sendXmlToCancelOutbound: boolean("send_xml_to_cancel_outbound")
      .notNull()
      .default(false),
    sendXmlToCceOutbound: boolean("send_xml_to_cce_outbound")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    organizationCompanyIdUnique: uniqueIndex("organization_company_settings_company_id_unique").on(
      table.organizationCompanyId
    ),
  })
);

export const organizationCertificates = pgTable(
  "organization_certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }),
    description: text("description"),
    status: certificateStatusEnum("status").notNull().default("active"),
    keyVaultCertName: varchar("key_vault_cert_name", { length: 255 }).notNull(),
    keyVaultCertId: text("key_vault_cert_id").notNull(),
    keyVaultKeyId: text("key_vault_key_id"),
    passwordSecretName: varchar("password_secret_name", { length: 255 }),
    passwordSecretId: text("password_secret_id"),
    thumbprint: varchar("thumbprint", { length: 128 }),
    subject: text("subject"),
    issuer: text("issuer"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    organizationCompanyIdIdx: index("organization_certificates_organization_company_id_idx").on(
      table.organizationCompanyId
    ),
    oneActivePerCompany: uniqueIndex("organization_certificates_company_id_active_unique")
      .on(table.organizationCompanyId)
      .where(eq(table.status, "active")),
  })
);

export const organizationCompanyCertificates = pgTable(
  "organization_companies_certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }),
    description: text("description"),
    status: certificateStatusEnum("status").notNull().default("active"),
    keyVaultCertName: varchar("key_vault_cert_name", { length: 255 }).notNull(),
    keyVaultCertId: text("key_vault_cert_id").notNull(),
    keyVaultKeyId: text("key_vault_key_id"),
    passwordSecretName: varchar("password_secret_name", { length: 255 }).notNull(),
    passwordSecretId: text("password_secret_id"),
    thumbprint: varchar("thumbprint", { length: 128 }),
    subject: text("subject"),
    issuer: text("issuer"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    organizationCompanyIdIdx: index("organization_company_certificates_company_id_idx").on(
      table.organizationCompanyId
    ),
    oneActivePerCompany: uniqueIndex(
      "organization_company_certificates_company_id_active_unique"
    )
      .on(table.organizationCompanyId)
      .where(eq(table.status, "active")),
  })
);

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    action: jsonb("action").$type<NotificationAction | null>(),
    category: varchar("category", { length: 64 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("user_notifications_user_id_created_at_idx").on(
      table.userId,
      table.createdAt
    ),
    userIdReadAtIdx: index("user_notifications_user_id_read_at_idx").on(
      table.userId,
      table.readAt
    ),
  })
);
