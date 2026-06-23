import { and, eq } from "drizzle-orm";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import type { Db } from "../../../db/client.js";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
import {
  emailConfirmationTokens,
  organizationMembers,
  organizationRoles,
  organizations,
  users,
} from "../../../db/schema.js";
import { enqueueEmailJob } from "../../../workers/email.enqueue.js";
import { DEFAULT_MEMBER_ROLE_NAME, DEFAULT_MEMBER_SCOPES } from "../constants.js";
import { generateOpaqueToken, hashToken } from "../../auth/services/token.service.js";
import type { OrganizationRequestContext } from "../types.js";

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

export async function loadOrganizationMembership(
  fastify: FastifyInstance,
  organizationId: string,
  userId: string
): Promise<OrganizationRequestContext | null> {
  const [row] = await fastify.db
    .select({
      membershipId: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      organizationRoleId: organizationMembers.organizationRoleId,
      roleName: organizationRoles.name,
      scopes: organizationRoles.scopes,
      userStatus: users.status,
    })
    .from(organizationMembers)
    .innerJoin(
      organizationRoles,
      eq(organizationRoles.id, organizationMembers.organizationRoleId)
    )
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);
  if (!row) return null;
  if (row.userStatus === "blocked" || row.userStatus === "inactive") {
    return null;
  }
  return {
    membershipId: row.membershipId,
    organizationId: row.organizationId,
    organizationRoleId: row.organizationRoleId,
    roleName: row.roleName,
    scopes: row.scopes ?? [],
  };
}

export async function organizationExists(
  fastify: FastifyInstance,
  organizationId: string
): Promise<boolean> {
  const [row] = await fastify.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return !!row;
}

export async function listOrganizations(fastify: FastifyInstance) {
  return fastify.db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations)
    .orderBy(organizations.createdAt);
}

export async function getOrganizationForMember(
  fastify: FastifyInstance,
  organizationId: string
) {
  const [org] = await fastify.db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org ?? null;
}

export async function getOrganizationForUserMember(
  fastify: FastifyInstance,
  userId: string
) {
  const [row] = await fastify.db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      roleName: organizationRoles.name,
      scopes: organizationRoles.scopes,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(
      organizationRoles,
      eq(organizationRoles.id, organizationMembers.organizationRoleId)
    )
    .where(eq(organizationMembers.userId, userId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    membership: {
      roleName: row.roleName,
      scopes: row.scopes ?? [],
    },
  };
}

export async function createOrganization(
  fastify: FastifyInstance,
  adminUserId: string,
  input: { name: string; description?: string; firstMemberUserId?: string }
) {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const scopes = [...DEFAULT_MEMBER_SCOPES];

  return fastify.db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name,
        description: description ?? undefined,
        createdByUserId: adminUserId,
      })
      .returning({
        id: organizations.id,
        name: organizations.name,
        description: organizations.description,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
      });
    if (!org) throw new AppError("internal_error", 500);

    const [defaultRole] = await tx
      .insert(organizationRoles)
      .values({
        organizationId: org.id,
        name: DEFAULT_MEMBER_ROLE_NAME,
        scopes,
      })
      .returning({
        id: organizationRoles.id,
        name: organizationRoles.name,
        scopes: organizationRoles.scopes,
      });
    if (!defaultRole) throw new AppError("internal_error", 500);

    if (input.firstMemberUserId) {
      await insertOrganizationMemberTx(tx, {
        organizationId: org.id,
        targetUserId: input.firstMemberUserId,
        organizationRoleId: defaultRole.id,
      });
    }

    return { organization: org, defaultRole: defaultRole };
  });
}

async function insertOrganizationMemberTx(
  tx: DbTransaction,
  input: { organizationId: string; targetUserId: string; organizationRoleId: string }
) {
  const [target] = await tx
    .select({
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!target) throw new AppError("org_target_user_not_found", 404);
  if (target.role !== "member") {
    throw new AppError("org_only_platform_members_in_org", 400);
  }

  const [existingMembership] = await tx
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, input.targetUserId))
    .limit(1);
  if (existingMembership) {
    throw new AppError("org_user_already_in_organization", 409);
  }

  const [role] = await tx
    .select({ id: organizationRoles.id, organizationId: organizationRoles.organizationId })
    .from(organizationRoles)
    .where(eq(organizationRoles.id, input.organizationRoleId))
    .limit(1);
  if (!role || role.organizationId !== input.organizationId) {
    throw new AppError("org_role_not_found", 404);
  }

  try {
    await tx.insert(organizationMembers).values({
      organizationId: input.organizationId,
      organizationRoleId: input.organizationRoleId,
      userId: input.targetUserId,
    });
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      throw new AppError("org_user_already_in_organization", 409);
    }
    throw e;
  }
}

export async function createOrganizationRole(
  fastify: FastifyInstance,
  organizationId: string,
  input: { name: string; description?: string; scopes: string[] }
) {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  try {
    const [row] = await fastify.db
      .insert(organizationRoles)
      .values({
        organizationId,
        name,
        description: description ?? undefined,
        scopes: input.scopes,
      })
      .returning({
        id: organizationRoles.id,
        organizationId: organizationRoles.organizationId,
        name: organizationRoles.name,
        description: organizationRoles.description,
        scopes: organizationRoles.scopes,
        createdAt: organizationRoles.createdAt,
        updatedAt: organizationRoles.updatedAt,
      });
    if (!row) throw new AppError("internal_error", 500);
    return row;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      throw new AppError("org_role_name_taken", 409);
    }
    throw e;
  }
}

export async function listOrganizationRoles(fastify: FastifyInstance, organizationId: string) {
  return fastify.db
    .select({
      id: organizationRoles.id,
      organizationId: organizationRoles.organizationId,
      name: organizationRoles.name,
      description: organizationRoles.description,
      scopes: organizationRoles.scopes,
      createdAt: organizationRoles.createdAt,
      updatedAt: organizationRoles.updatedAt,
    })
    .from(organizationRoles)
    .where(eq(organizationRoles.organizationId, organizationId));
}

export async function getOrganizationRoleById(
  fastify: FastifyInstance,
  organizationId: string,
  roleId: string
) {
  const [row] = await fastify.db
    .select({
      id: organizationRoles.id,
      organizationId: organizationRoles.organizationId,
      name: organizationRoles.name,
      description: organizationRoles.description,
      scopes: organizationRoles.scopes,
      createdAt: organizationRoles.createdAt,
      updatedAt: organizationRoles.updatedAt,
    })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.id, roleId),
        eq(organizationRoles.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) throw new AppError("org_role_not_found", 404);
  return row;
}

export async function updateOrganizationRole(
  fastify: FastifyInstance,
  organizationId: string,
  roleId: string,
  input: { name?: string; description?: string | null; scopes?: string[] }
) {
  const [existing] = await fastify.db
    .select({ id: organizationRoles.id })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.id, roleId),
        eq(organizationRoles.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!existing) throw new AppError("org_role_not_found", 404);

  const now = new Date();
  const patch: {
    name?: string;
    description?: string | null;
    scopes?: string[];
    updatedAt: Date;
  } = { updatedAt: now };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.scopes !== undefined) patch.scopes = input.scopes;

  try {
    const [row] = await fastify.db
      .update(organizationRoles)
      .set(patch)
      .where(eq(organizationRoles.id, roleId))
      .returning({
        id: organizationRoles.id,
        organizationId: organizationRoles.organizationId,
        name: organizationRoles.name,
        description: organizationRoles.description,
        scopes: organizationRoles.scopes,
        createdAt: organizationRoles.createdAt,
        updatedAt: organizationRoles.updatedAt,
      });
    if (!row) throw new AppError("internal_error", 500);
    return row;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      throw new AppError("org_role_name_taken", 409);
    }
    throw e;
  }
}

export async function deleteOrganizationRole(
  fastify: FastifyInstance,
  organizationId: string,
  roleId: string
) {
  const [existing] = await fastify.db
    .select({
      id: organizationRoles.id,
      name: organizationRoles.name,
    })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.id, roleId),
        eq(organizationRoles.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!existing) throw new AppError("org_role_not_found", 404);
  if (existing.name === DEFAULT_MEMBER_ROLE_NAME) {
    throw new AppError("org_role_default_protected", 400);
  }

  const [memberUsingRole] = await fastify.db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.organizationRoleId, roleId)
      )
    )
    .limit(1);
  if (memberUsingRole) throw new AppError("org_role_in_use", 409);

  await fastify.db.delete(organizationRoles).where(eq(organizationRoles.id, roleId));
}

export async function addOrganizationMember(
  fastify: FastifyInstance,
  organizationId: string,
  input: { userId: string; organizationRoleId: string }
) {
  await fastify.db.transaction(async (tx) => {
    await insertOrganizationMemberTx(tx, {
      organizationId,
      targetUserId: input.userId,
      organizationRoleId: input.organizationRoleId,
    });
  });
}

export async function updateOrganizationMemberRole(
  fastify: FastifyInstance,
  organizationId: string,
  memberId: string,
  organizationRoleId: string
) {
  const [member] = await fastify.db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.id, memberId),
        eq(organizationMembers.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!member) throw new AppError("org_member_not_found", 404);

  const [role] = await fastify.db
    .select({ id: organizationRoles.id })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.id, organizationRoleId),
        eq(organizationRoles.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!role) throw new AppError("org_role_not_found", 404);

  await fastify.db
    .update(organizationMembers)
    .set({ organizationRoleId, updatedAt: new Date() })
    .where(eq(organizationMembers.id, memberId));
}

export async function listOrganizationMembers(
  fastify: FastifyInstance,
  organizationId: string
) {
  return fastify.db
    .select({
      memberId: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: users.id,
      email: users.email,
      name: users.name,
      avatar: users.avatar,
      phoneNumber: users.phoneNumber,
      userStatus: users.status,
      organizationRoleId: organizationMembers.organizationRoleId,
      organizationRoleName: organizationRoles.name,
      organizationRoleScopes: organizationRoles.scopes,
      memberCreatedAt: organizationMembers.createdAt,
      memberUpdatedAt: organizationMembers.updatedAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .innerJoin(
      organizationRoles,
      eq(organizationRoles.id, organizationMembers.organizationRoleId)
    )
    .where(eq(organizationMembers.organizationId, organizationId));
}

export async function listOrganizationUsers(
  fastify: FastifyInstance,
  organizationId: string
) {
  return listOrganizationMembers(fastify, organizationId);
}

export async function getDefaultMemberRoleId(
  fastify: FastifyInstance,
  organizationId: string
): Promise<string> {
  const [row] = await fastify.db
    .select({ id: organizationRoles.id })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.organizationId, organizationId),
        eq(organizationRoles.name, DEFAULT_MEMBER_ROLE_NAME)
      )
    )
    .limit(1);
  if (!row) throw new AppError("org_default_role_missing", 500);
  return row.id;
}

export async function createOrganizationUser(
  fastify: FastifyInstance,
  organizationId: string,
  input: { email: string; password: string; name?: string }
) {
  const email = input.email.toLowerCase().trim();
  const name = (input.name?.trim() || defaultNameFromEmail(email)).slice(0, 255);
  const passwordHash = await argon2.hash(input.password);
  const defaultRoleId = await getDefaultMemberRoleId(fastify, organizationId);

  const rawConfirm = generateOpaqueToken();
  const confirmTokenHash = hashToken(rawConfirm);
  const confirmExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  let userId: string;
  try {
    userId = await fastify.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({ email, passwordHash, name, role: "member" })
        .returning({ id: users.id });
      if (!row) throw new AppError("internal_error", 500);

      await tx.insert(organizationMembers).values({
        organizationId,
        organizationRoleId: defaultRoleId,
        userId: row.id,
      });

      await tx.insert(emailConfirmationTokens).values({
        userId: row.id,
        tokenHash: confirmTokenHash,
        expiresAt: confirmExpiresAt,
      });
      return row.id;
    });
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      throw new AppError("auth_email_taken", 409);
    }
    throw e;
  }

  const confirmUrl = `${fastify.env.APP_BASE_URL}/confirm-email?token=${rawConfirm}`;
  await enqueueEmailJob(fastify.db, fastify.emailQueue, {
    template: "welcome",
    to: email,
    vars: {
      email,
      name,
      appUrl: fastify.env.APP_BASE_URL,
      confirmUrl,
    },
  });

  const [user] = await fastify.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatar: users.avatar,
      phoneNumber: users.phoneNumber,
      confirmedAt: users.confirmedAt,
      onboardingAt: users.onboardingAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError("internal_error", 500);
  return user;
}
