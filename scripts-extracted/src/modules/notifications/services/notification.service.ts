import { and, count, desc, eq, isNull } from "drizzle-orm";
import { AppError } from "../../../common/http/errors.js";
import type { Db } from "../../../db/client.js";
import { userNotifications } from "../../../db/schema.js";
import type { NotificationAction } from "../types.js";

type DbExecutor = Pick<Db, "insert" | "select" | "update">;

export type UserNotificationRow = {
  id: string;
  title: string;
  description: string;
  action: NotificationAction | null;
  category: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function mapRow(row: typeof userNotifications.$inferSelect): UserNotificationRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    action: row.action ?? null,
    category: row.category ?? null,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
  };
}

export async function createUserNotification(
  db: DbExecutor,
  input: {
    userId: string;
    title: string;
    description: string;
    action?: NotificationAction;
    category?: string;
  }
): Promise<UserNotificationRow> {
  const [row] = await db
    .insert(userNotifications)
    .values({
      userId: input.userId,
      title: input.title,
      description: input.description,
      action: input.action ?? null,
      category: input.category ?? null,
    })
    .returning();
  return mapRow(row);
}

export async function listUserNotifications(
  db: DbExecutor,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<UserNotificationRow[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const conditions = [eq(userNotifications.userId, userId)];
  if (opts.unreadOnly) {
    conditions.push(isNull(userNotifications.readAt));
  }
  const rows = await db
    .select()
    .from(userNotifications)
    .where(and(...conditions))
    .orderBy(desc(userNotifications.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map(mapRow);
}

export async function countUnreadUserNotifications(
  db: DbExecutor,
  userId: string
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)));
  return row?.value ?? 0;
}

export async function markUserNotificationRead(
  db: DbExecutor,
  userId: string,
  notificationId: string
): Promise<UserNotificationRow> {
  const now = new Date();
  const [row] = await db
    .update(userNotifications)
    .set({ readAt: now })
    .where(
      and(
        eq(userNotifications.id, notificationId),
        eq(userNotifications.userId, userId)
      )
    )
    .returning();
  if (!row) {
    throw new AppError("notification_not_found", 404);
  }
  return mapRow(row);
}

export async function markAllUserNotificationsRead(
  db: DbExecutor,
  userId: string
): Promise<number> {
  const now = new Date();
  const updated = await db
    .update(userNotifications)
    .set({ readAt: now })
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)))
    .returning({ id: userNotifications.id });
  return updated.length;
}
