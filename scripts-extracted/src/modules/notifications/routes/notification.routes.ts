import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../common/middleware/auth.js";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  unreadNotificationsCountHandler,
} from "../handlers/notification.handler.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "../schemas.js";

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/me/notifications",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = listNotificationsQuerySchema.safeParse(request.query);
      if (!parsed.success) throw parsed.error;
      return listNotificationsHandler(request, reply, parsed.data);
    }
  );

  fastify.get(
    "/me/notifications/unread-count",
    { preHandler: requireAuth },
    unreadNotificationsCountHandler
  );

  fastify.patch(
    "/me/notifications/read-all",
    { preHandler: requireAuth },
    markAllNotificationsReadHandler
  );

  fastify.patch(
    "/me/notifications/:notificationId/read",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = notificationIdParamSchema.safeParse(request.params);
      if (!parsed.success) throw parsed.error;
      return markNotificationReadHandler(
        request,
        reply,
        parsed.data.notificationId
      );
    }
  );
}
