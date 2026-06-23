import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { sendError } from "../../../common/http/responses.js";
import { users } from "../../../db/schema.js";
import { organizationIdParamSchema } from "../schemas.js";
import {
  loadOrganizationMembership,
  organizationExists,
} from "../services/organization.service.js";

export async function requireOrganizationMember(request: FastifyRequest, reply: FastifyReply) {
  const parsed = organizationIdParamSchema.safeParse(request.params);
  if (!parsed.success) {
    return sendError(reply, "org_invalid_id", 400, request.t("org_invalid_id"));
  }
  const { organizationId } = parsed.data;
  const userId = request.user.sub;
  const ctx = await loadOrganizationMembership(request.server, organizationId, userId);
  if (ctx) {
    request.organizationContext = ctx;
    return;
  }
  const [userRow] = await request.server.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRow?.role === "admin") {
    const exists = await organizationExists(request.server, organizationId);
    if (!exists) {
      return sendError(reply, "org_not_found", 404, request.t("org_not_found"));
    }
    request.organizationContext = {
      membershipId: "__platform_admin__",
      organizationId,
      organizationRoleId: "__platform_admin__",
      roleName: "platform_admin",
      scopes: [],
      platformAdminAccess: true,
    };
    return;
  }
  return sendError(reply, "org_forbidden", 403, request.t("org_forbidden"));
}
