import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { sendSuccess } from "../../../common/http/responses.js";
import {
  addOrganizationMemberBodySchema,
  createOrganizationBodySchema,
  createOrganizationRoleBodySchema,
  createOrganizationUserBodySchema,
  organizationMemberIdParamSchema,
  organizationRoleIdParamSchema,
  updateOrganizationMemberRoleBodySchema,
  updateOrganizationRoleBodySchema,
} from "../schemas.js";
import {
  addOrganizationMember,
  createOrganization,
  createOrganizationRole,
  createOrganizationUser,
  deleteOrganizationRole,
  getOrganizationRoleById,
  getOrganizationForMember,
  listOrganizations,
  listOrganizationMembers,
  listOrganizationRoles,
  listOrganizationUsers,
  updateOrganizationMemberRole,
  updateOrganizationRole,
} from "../services/organization.service.js";
import {
  getOrganizationIntegrationSettings,
  patchOrganizationIntegrationSettings,
} from "../services/organization-integration-settings.service.js";
import type { patchOrganizationIntegrationSettingsBodySchema } from "../schemas.js";

export async function createOrganizationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof createOrganizationBodySchema.parse>
) {
  const adminUserId = request.user.sub;
  const result = await createOrganization(request.server, adminUserId, {
    name: body.name,
    description: body.description,
    firstMemberUserId: body.firstMemberUserId,
  });
  return sendSuccess(
    reply,
    {
      organization: result.organization,
      defaultRole: result.defaultRole,
    },
    201
  );
}

export async function listOrganizationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const organizations = await listOrganizations(request.server);
  return sendSuccess(reply, { organizations });
}

export async function getOrganizationHandler(request: FastifyRequest, reply: FastifyReply) {
  const organizationId = request.organizationContext!.organizationId;
  const org = await getOrganizationForMember(request.server, organizationId);
  if (!org) throw new AppError("org_not_found", 404);
  return sendSuccess(reply, { organization: org });
}

export async function createOrganizationRoleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof createOrganizationRoleBodySchema.parse>
) {
  const organizationId = request.organizationContext!.organizationId;
  const row = await createOrganizationRole(request.server, organizationId, {
    name: body.name,
    description: body.description,
    scopes: body.scopes ?? [],
  });
  return sendSuccess(reply, { role: row }, 201);
}

export async function listOrganizationRolesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const roles = await listOrganizationRoles(request.server, organizationId);
  return sendSuccess(reply, { roles });
}

export async function getOrganizationRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsedParams = organizationRoleIdParamSchema.safeParse(request.params);
  if (!parsedParams.success) throw parsedParams.error;
  const { organizationId, roleId } = parsedParams.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const role = await getOrganizationRoleById(request.server, organizationId, roleId);
  return sendSuccess(reply, { role });
}

export async function updateOrganizationRoleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof updateOrganizationRoleBodySchema.parse>
) {
  const parsedParams = organizationRoleIdParamSchema.safeParse(request.params);
  if (!parsedParams.success) throw parsedParams.error;
  const { organizationId, roleId } = parsedParams.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  const row = await updateOrganizationRole(request.server, organizationId, roleId, {
    name: body.name,
    description: body.description,
    scopes: body.scopes,
  });
  return sendSuccess(reply, { role: row });
}

export async function deleteOrganizationRoleHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsedParams = organizationRoleIdParamSchema.safeParse(request.params);
  if (!parsedParams.success) throw parsedParams.error;
  const { organizationId, roleId } = parsedParams.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  await deleteOrganizationRole(request.server, organizationId, roleId);
  return sendSuccess(reply, { ok: true });
}

export async function addOrganizationMemberHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof addOrganizationMemberBodySchema.parse>
) {
  const organizationId = request.organizationContext!.organizationId;
  await addOrganizationMember(request.server, organizationId, {
    userId: body.userId,
    organizationRoleId: body.organizationRoleId,
  });
  return sendSuccess(reply, { ok: true }, 201);
}

export async function updateOrganizationMemberRoleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof updateOrganizationMemberRoleBodySchema.parse>
) {
  const parsedParams = organizationMemberIdParamSchema.safeParse(request.params);
  if (!parsedParams.success) throw parsedParams.error;
  const { organizationId, memberId } = parsedParams.data;
  if (organizationId !== request.organizationContext!.organizationId) {
    throw new AppError("org_forbidden", 403);
  }
  await updateOrganizationMemberRole(
    request.server,
    organizationId,
    memberId,
    body.organizationRoleId
  );
  return sendSuccess(reply, { ok: true });
}

export async function createOrganizationUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof createOrganizationUserBodySchema.parse>
) {
  const organizationId = request.organizationContext!.organizationId;
  const user = await createOrganizationUser(request.server, organizationId, body);
  return sendSuccess(reply, { user }, 201);
}

export async function listOrganizationMembersHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const members = await listOrganizationMembers(request.server, organizationId);
  return sendSuccess(reply, { members });
}

export async function listOrganizationUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const users = await listOrganizationUsers(request.server, organizationId);
  return sendSuccess(reply, { users });
}

export async function getOrganizationIntegrationSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const integrationSettings = await getOrganizationIntegrationSettings(
    request.server,
    organizationId
  );
  return sendSuccess(reply, { integrationSettings });
}

export async function patchOrganizationIntegrationSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: ReturnType<typeof patchOrganizationIntegrationSettingsBodySchema.parse>
) {
  const organizationId = request.organizationContext!.organizationId;
  const integrationSettings = await patchOrganizationIntegrationSettings(
    request.server,
    organizationId,
    {
      cpiBaseUrl: body.cpiBaseUrl,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      authType: body.authType,
      sapClient: body.sapClient,
      sapLanguage: body.sapLanguage,
    }
  );
  return sendSuccess(reply, { integrationSettings });
}
