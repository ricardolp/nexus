import { and, eq, gt, isNull } from "drizzle-orm";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { emailConfirmationTokens, passwordResetTokens, users } from "../../../db/schema.js";
import { enqueueEmailJob } from "../../../workers/email.enqueue.js";
import { generateOpaqueToken, hashToken } from "./token.service.js";
import { revokeAllSessionsForUser } from "./user-session.service.js";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "23505"
  );
}

function defaultNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "User";
}

export async function registerUser(
  fastify: FastifyInstance,
  input: { email: string; password: string; name?: string }
) {
  const email = input.email.toLowerCase().trim();
  const name = (input.name?.trim() || defaultNameFromEmail(email)).slice(0, 255);
  const passwordHash = await argon2.hash(input.password);
  try {
    const [row] = await fastify.db
      .insert(users)
      .values({ email, passwordHash, name, role: "member" })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatar: users.avatar,
        phoneNumber: users.phoneNumber,
        confirmedAt: users.confirmedAt,
        onboardingAt: users.onboardingAt,
      });
    if (!row) throw new AppError("internal_error", 500);
    const rawConfirm = generateOpaqueToken();
    const confirmTokenHash = hashToken(rawConfirm);
    const confirmExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await fastify.db.insert(emailConfirmationTokens).values({
      userId: row.id,
      tokenHash: confirmTokenHash,
      expiresAt: confirmExpiresAt,
    });
    const confirmUrl = `${fastify.env.APP_BASE_URL}/confirm-email?token=${rawConfirm}`;
    await enqueueEmailJob(fastify.db, fastify.emailQueue, {
      template: "welcome",
      to: row.email,
      vars: {
        email: row.email,
        name: row.name,
        appUrl: fastify.env.APP_BASE_URL,
        confirmUrl,
      },
    });
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatar: row.avatar,
      phoneNumber: row.phoneNumber,
      confirmedAt: row.confirmedAt,
      onboardingAt: row.onboardingAt,
    };
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      throw new AppError("auth_email_taken", 409);
    }
    throw e;
  }
}

export async function loginUser(
  fastify: FastifyInstance,
  input: { email: string; password: string }
) {
  const email = input.email.toLowerCase().trim();
  const [user] = await fastify.db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) throw new AppError("auth_invalid_credentials", 401);
  const ok = await argon2.verify(user.passwordHash, input.password);
  if (!ok) throw new AppError("auth_invalid_credentials", 401);
  if (user.status === "blocked") {
    throw new AppError("auth_account_blocked", 403);
  }
  if (user.status === "inactive") {
    throw new AppError("auth_account_inactive", 403);
  }
  if (!user.confirmedAt) {
    throw new AppError("auth_email_unconfirmed", 403);
  }
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    phoneNumber: user.phoneNumber,
    confirmedAt: user.confirmedAt,
    onboardingAt: user.onboardingAt,
  };
}

export async function blockUserByEmailAfterLoginRateAbuse(
  fastify: FastifyInstance,
  emailRaw: string
) {
  const email = emailRaw.toLowerCase().trim();
  if (!email) return;
  const now = new Date();
  await fastify.db
    .update(users)
    .set({ status: "blocked", updatedAt: now })
    .where(eq(users.email, email));
}

export async function requestPasswordReset(fastify: FastifyInstance, emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  const [user] = await fastify.db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return;
  const raw = generateOpaqueToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await fastify.db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });
  const resetUrl = `${fastify.env.APP_BASE_URL}/reset-password?token=${raw}`;
  await enqueueEmailJob(fastify.db, fastify.emailQueue, {
    template: "password-reset",
    to: user.email,
    vars: { resetUrl, email: user.email },
  });
}

export async function resetPassword(
  fastify: FastifyInstance,
  input: { token: string; password: string }
) {
  const tokenHash = hashToken(input.token);
  const [row] = await fastify.db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!row) throw new AppError("auth_reset_invalid", 400);
  const passwordHash = await argon2.hash(input.password);
  const now = new Date();
  await fastify.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, row.userId));
    await revokeAllSessionsForUser(tx, row.userId, now);
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, row.id));
  });
}

export async function confirmEmail(fastify: FastifyInstance, tokenRaw: string) {
  const tokenHash = hashToken(tokenRaw);
  const [row] = await fastify.db
    .select()
    .from(emailConfirmationTokens)
    .where(
      and(
        eq(emailConfirmationTokens.tokenHash, tokenHash),
        isNull(emailConfirmationTokens.usedAt),
        gt(emailConfirmationTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!row) throw new AppError("auth_confirm_invalid", 400);
  const now = new Date();
  const [user] = await fastify.db
    .select()
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user) throw new AppError("internal_error", 500);
  await fastify.db.transaction(async (tx) => {
    if (!user.confirmedAt) {
      await tx
        .update(users)
        .set({ confirmedAt: now, updatedAt: now })
        .where(eq(users.id, user.id));
    }
    await tx
      .update(emailConfirmationTokens)
      .set({ usedAt: now })
      .where(eq(emailConfirmationTokens.id, row.id));
  });
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    phoneNumber: user.phoneNumber,
    confirmedAt: user.confirmedAt ?? now,
    onboardingAt: user.onboardingAt,
  };
}
