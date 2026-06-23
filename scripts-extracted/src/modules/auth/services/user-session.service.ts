import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { userSessions } from "../../../db/schema.js";

const LAST_SEEN_TOUCH_MS = 5 * 60 * 1000;

type DbExecutor = Pick<Db, "insert" | "select" | "update">;

export async function createUserSession(
  db: DbExecutor,
  input: {
    sessionId: string;
    userId: string;
    userAgent: string | undefined;
    ip: string | undefined;
  }
) {
  await db.insert(userSessions).values({
    id: input.sessionId,
    userId: input.userId,
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
  });
}

export async function validateActiveSession(
  db: DbExecutor,
  userId: string,
  sessionId: string
): Promise<{ lastSeenAt: Date } | null> {
  const [row] = await db
    .select({ lastSeenAt: userSessions.lastSeenAt })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, sessionId),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function touchSessionLastSeenThrottled(
  db: DbExecutor,
  sessionId: string,
  lastSeenAt: Date,
  now: Date = new Date()
): Promise<void> {
  if (now.getTime() - lastSeenAt.getTime() < LAST_SEEN_TOUCH_MS) return;
  await db
    .update(userSessions)
    .set({ lastSeenAt: now })
    .where(eq(userSessions.id, sessionId));
}

export async function revokeAllSessionsForUser(
  db: DbExecutor,
  userId: string,
  at: Date = new Date()
) {
  await db
    .update(userSessions)
    .set({ revokedAt: at })
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
}

export async function listActiveSessionsForUser(db: DbExecutor, userId: string) {
  return db
    .select({
      id: userSessions.id,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
      userAgent: userSessions.userAgent,
      ip: userSessions.ip,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
    .orderBy(desc(userSessions.createdAt));
}

export type RevokeOneSessionResult = "not_found" | "already_revoked" | "revoked";

export async function revokeSessionForUser(
  db: DbExecutor,
  userId: string,
  sessionId: string,
  at: Date = new Date()
): Promise<RevokeOneSessionResult> {
  const [row] = await db
    .select({
      userId: userSessions.userId,
      revokedAt: userSessions.revokedAt,
    })
    .from(userSessions)
    .where(eq(userSessions.id, sessionId))
    .limit(1);
  if (!row || row.userId !== userId) return "not_found";
  if (row.revokedAt) return "already_revoked";
  await db
    .update(userSessions)
    .set({ revokedAt: at })
    .where(eq(userSessions.id, sessionId));
  return "revoked";
}
