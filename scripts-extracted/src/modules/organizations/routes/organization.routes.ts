import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../common/middleware/auth.js";
import {
  createCompanyHandler,
  deleteCertificateHandler,
  deleteCompanyHandler,
  getCertificateHandler,
  getCompanyHandler,
  getCompanyEmailSettingsHandler,
  getCompanyEmailTemplateHandler,
  getCompanySettingsHandler,
  listCertificatesHandler,
  listCompanyEmailTemplatesHandler,
  patchCompanyEmailSettingsHandler,
  patchCompanyEmailTemplateHandler,
  listCompaniesHandler,
  patchCompanySettingsHandler,
  updateCertificateHandler,
  updateCompanyHandler,
  uploadCertificateHandler,
} from "../handlers/company.handler.js";
import {
  getOrganizationIntegrationLogHandler,
  listOrganizationIntegrationLogsHandler,
} from "../handlers/integration-log.handler.js";
import {
  addOrganizationMemberHandler,
  createOrganizationHandler,
  listOrganizationsHandler,
  createOrganizationRoleHandler,
  createOrganizationUserHandler,
  deleteOrganizationRoleHandler,
  getOrganizationRoleHandler,
  getOrganizationHandler,
  getOrganizationIntegrationSettingsHandler,
  patchOrganizationIntegrationSettingsHandler,
  listOrganizationMembersHandler,
  listOrganizationRolesHandler,
  listOrganizationUsersHandler,
  updateOrganizationMemberRoleHandler,
  updateOrganizationRoleHandler,
} from "../handlers/organization.handler.js";
import { requireOrganizationMember } from "../middleware/org-member.middleware.js";
import { requirePlatformAdmin } from "../middleware/platform-admin.middleware.js";
import { requireScope } from "../middleware/require-scope.middleware.js";
import { registerNfeRoutes } from "../../nfe/routes/nfe.routes.js";
import {
  addOrganizationMemberBodySchema,
  createOrganizationBodySchema,
  createOrganizationRoleBodySchema,
  createOrganizationUserBodySchema,
  updateOrganizationMemberRoleBodySchema,
  updateOrganizationRoleBodySchema,
  createOrganizationCompanyBodySchema,
  patchOrganizationCompanyEmailSettingsBodySchema,
  patchOrganizationCompanyEmailTemplateBodySchema,
  patchOrganizationCompanySettingsBodySchema,
  patchOrganizationIntegrationSettingsBodySchema,
  updateOrganizationCompanyBodySchema,
  updateOrganizationCompanyCertificateBodySchema,
} from "../schemas.js";

export async function organizationRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/organizations",
    { preHandler: [requireAuth, requirePlatformAdmin] },
    listOrganizationsHandler
  );

  fastify.post(
    "/organizations",
    { preHandler: [requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = createOrganizationBodySchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      return createOrganizationHandler(request, reply, parsed.data);
    }
  );

  await fastify.register(
    async (scope) => {
      scope.addHook("preHandler", requireAuth);
      scope.addHook("preHandler", requireOrganizationMember);

      await scope.register(multipart, {
        limits: {
          fileSize: 10 * 1024 * 1024,
          fields: 20,
          files: 1,
        },
      });

      scope.get(
        "/",
        { preHandler: [requireScope("organization:read")] },
        async (request, reply) => getOrganizationHandler(request, reply)
      );

      scope.get(
        "/integration",
        { preHandler: [requireScope("organization_integration:read")] },
        getOrganizationIntegrationSettingsHandler
      );

      scope.patch(
        "/integration",
        { preHandler: [requireScope("organization_integration:update")] },
        async (request, reply) => {
          const parsed = patchOrganizationIntegrationSettingsBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return patchOrganizationIntegrationSettingsHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/integration/logs",
        { preHandler: [requireScope("organization_integration:read")] },
        listOrganizationIntegrationLogsHandler
      );

      scope.get(
        "/integration/logs/:logId",
        { preHandler: [requireScope("organization_integration:read")] },
        getOrganizationIntegrationLogHandler
      );

      scope.post(
        "/roles",
        { preHandler: [requireScope("organization_role:create")] },
        async (request, reply) => {
          const parsed = createOrganizationRoleBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return createOrganizationRoleHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/roles",
        { preHandler: [requireScope("organization_role:read")] },
        listOrganizationRolesHandler
      );

      scope.get(
        "/roles/:roleId",
        { preHandler: [requireScope("organization_role:read")] },
        getOrganizationRoleHandler
      );

      scope.patch(
        "/roles/:roleId",
        { preHandler: [requireScope("organization_role:update")] },
        async (request, reply) => {
          const parsed = updateOrganizationRoleBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return updateOrganizationRoleHandler(request, reply, parsed.data);
        }
      );

      scope.delete(
        "/roles/:roleId",
        { preHandler: [requireScope("organization_role:delete")] },
        deleteOrganizationRoleHandler
      );

      scope.get(
        "/members",
        { preHandler: [requireScope("user:read")] },
        listOrganizationMembersHandler
      );

      scope.post(
        "/members",
        { preHandler: [requireScope("member:create")] },
        async (request, reply) => {
          const parsed = addOrganizationMemberBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return addOrganizationMemberHandler(request, reply, parsed.data);
        }
      );

      scope.patch(
        "/members/:memberId/role",
        { preHandler: [requireScope("member:update")] },
        async (request, reply) => {
          const parsed = updateOrganizationMemberRoleBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return updateOrganizationMemberRoleHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/users",
        { preHandler: [requireScope("user:read")] },
        listOrganizationUsersHandler
      );

      scope.post(
        "/users",
        { preHandler: [requireScope("user:create")] },
        async (request, reply) => {
          const parsed = createOrganizationUserBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return createOrganizationUserHandler(request, reply, parsed.data);
        }
      );

      scope.get("/companies", { preHandler: [requireScope("company:read")] }, listCompaniesHandler);

      scope.post(
        "/companies",
        { preHandler: [requireScope("company:create")] },
        async (request, reply) => {
          const parsed = createOrganizationCompanyBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return createCompanyHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/companies/:companyId",
        { preHandler: [requireScope("company:read")] },
        getCompanyHandler
      );

      scope.patch(
        "/companies/:companyId",
        { preHandler: [requireScope("company:update")] },
        async (request, reply) => {
          const parsed = updateOrganizationCompanyBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return updateCompanyHandler(request, reply, parsed.data);
        }
      );

      scope.delete(
        "/companies/:companyId",
        { preHandler: [requireScope("company:delete")] },
        deleteCompanyHandler
      );

      scope.get(
        "/companies/:companyId/settings",
        { preHandler: [requireScope("company:read")] },
        getCompanySettingsHandler
      );

      scope.patch(
        "/companies/:companyId/settings",
        { preHandler: [requireScope("company:update")] },
        async (request, reply) => {
          const parsed = patchOrganizationCompanySettingsBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return patchCompanySettingsHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/companies/:companyId/email-settings",
        { preHandler: [requireScope("company:read")] },
        getCompanyEmailSettingsHandler
      );

      scope.patch(
        "/companies/:companyId/email-settings",
        { preHandler: [requireScope("company:update")] },
        async (request, reply) => {
          const parsed = patchOrganizationCompanyEmailSettingsBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return patchCompanyEmailSettingsHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/companies/:companyId/email-templates",
        { preHandler: [requireScope("company:read")] },
        listCompanyEmailTemplatesHandler
      );

      scope.get(
        "/companies/:companyId/email-templates/:templateType",
        { preHandler: [requireScope("company:read")] },
        getCompanyEmailTemplateHandler
      );

      scope.patch(
        "/companies/:companyId/email-templates/:templateType",
        { preHandler: [requireScope("company:update")] },
        async (request, reply) => {
          const parsed = patchOrganizationCompanyEmailTemplateBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return patchCompanyEmailTemplateHandler(request, reply, parsed.data);
        }
      );

      scope.get(
        "/companies/:companyId/certificates",
        { preHandler: [requireScope("company_certificate:read")] },
        listCertificatesHandler
      );

      scope.post(
        "/companies/:companyId/certificates",
        { preHandler: [requireScope("company_certificate:create")] },
        uploadCertificateHandler
      );

      scope.get(
        "/companies/:companyId/certificates/:certificateId",
        { preHandler: [requireScope("company_certificate:read")] },
        getCertificateHandler
      );

      scope.patch(
        "/companies/:companyId/certificates/:certificateId",
        { preHandler: [requireScope("company_certificate:update")] },
        async (request, reply) => {
          const parsed = updateOrganizationCompanyCertificateBodySchema.safeParse(request.body);
          if (!parsed.success) throw parsed.error;
          return updateCertificateHandler(request, reply, parsed.data);
        }
      );

      scope.delete(
        "/companies/:companyId/certificates/:certificateId",
        { preHandler: [requireScope("company_certificate:delete")] },
        deleteCertificateHandler
      );

      await registerNfeRoutes(scope);
    },
    { prefix: "/organizations/:organizationId" }
  );
}
