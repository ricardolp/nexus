import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { sendError } from "../../../common/http/responses.js";
import { users } from "../../../db/schema.js";

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.sub;
  const [row] = await request.server.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.role !== "admin") {
    return sendError(reply, "forbidden_platform_admin_only", 403, request.t("forbidden_platform_admin_only"));
  }
}
