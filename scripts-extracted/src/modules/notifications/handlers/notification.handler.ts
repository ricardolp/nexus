import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import type { listNotificationsQuerySchema } from "../schemas.js";
import {
  countUnreadUserNotifications,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "../services/notification.service.js";

export async function listNotificationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  query: ReturnType<typeof listNotificationsQuerySchema.parse>
) {
  const userId = request.user.sub;
  const notifications = await listUserNotifications(request.server.db, userId, {
    unreadOnly: query.unreadOnly,
    limit: query.limit,
    offset: query.offset,
  });
  return sendSuccess(reply, { notifications });
}

export async function unreadNotificationsCountHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.user.sub;
  const count = await countUnreadUserNotifications(request.server.db, userId);
  return sendSuccess(reply, { count });
}

export async function markNotificationReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  notificationId: string
) {
  const userId = request.user.sub;
  const notification = await markUserNotificationRead(
    request.server.db,
    userId,
    notificationId
  );
  return sendSuccess(reply, { notification });
}

export async function markAllNotificationsReadHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.user.sub;
  await markAllUserNotificationsRead(request.server.db, userId);
  return reply.status(204).send();
}
