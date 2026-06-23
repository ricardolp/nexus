import rateLimit from "@fastify/rate-limit";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { sendError, sendSuccess } from "../../common/http/responses.js";
import { requireAuth } from "../../common/middleware/auth.js";
import { users } from "../../db/schema.js";
import { getOrganizationForUserMember } from "../organizations/services/organization.service.js";
import {
  listActiveSessionsForUser,
  revokeSessionForUser,
} from "../auth/services/user-session.service.js";
import { notificationRoutes } from "../notifications/routes/notification.routes.js";

export async function meModule(fastify: FastifyInstance) {
  await fastify.register(
    async (scope) => {
      await scope.register(rateLimit, { max: 120, timeWindow: "1 minute" });
      scope.get(
        "/me",
        { preHandler: requireAuth },
        async (request, reply) => {
          const userId = request.user.sub;
          const [row] = await request.server.db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              role: users.role,
              status: users.status,
              avatar: users.avatar,
              phoneNumber: users.phoneNumber,
              emailVerifiedAt: users.emailVerifiedAt,
              confirmedAt: users.confirmedAt,
              onboardingAt: users.onboardingAt,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (!row) {
            return sendError(reply, "not_found", 404, request.t("not_found"));
          }
          if (row.status === "blocked") {
            return sendError(
              reply,
              "auth_account_blocked",
              403,
              request.t("auth_account_blocked")
            );
          }
          if (row.status === "inactive") {
            return sendError(
              reply,
              "auth_account_inactive",
              403,
              request.t("auth_account_inactive")
            );
          }
          const organization =
            row.role === "member"
              ? await getOrganizationForUserMember(request.server, row.id)
              : null;
          return sendSuccess(reply, { user: row, organization });
        }
      );

      scope.get(
        "/me/sessions",
        { preHandler: requireAuth },
        async (request, reply) => {
          const userId = request.user.sub;
          const currentJti = request.user.jti;
          const rows = await listActiveSessionsForUser(request.server.db, userId);
          const sessions = rows.map((s) => ({
            id: s.id,
            createdAt: s.createdAt,
            lastSeenAt: s.lastSeenAt,
            userAgent: s.userAgent,
            ip: s.ip,
            isCurrent: s.id === currentJti,
          }));
          return sendSuccess(reply, { sessions });
        }
      );

      await scope.register(notificationRoutes);

      scope.delete<{ Params: { sessionId: string } }>(
        "/me/sessions/:sessionId",
        { preHandler: requireAuth },
        async (request, reply) => {
          const userId = request.user.sub;
          const { sessionId } = request.params;
          const result = await revokeSessionForUser(
            request.server.db,
            userId,
            sessionId
          );
          if (result === "not_found") {
            return sendError(
              reply,
              "auth_session_not_found",
              404,
              request.t("auth_session_not_found")
            );
          }
          return reply.status(204).send();
        }
      );
    },
    { prefix: "" }
  );
}
