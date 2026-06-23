import type { Redis } from "ioredis";

const NS = "nexus:login:bf:";
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_THRESHOLD = 5;
const BLOCK_ESCALATE = 10;
const LOCK_MS_TIER: [number, number, number] = [
  60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];
const LAST_EMAIL_TTL_SEC = 7 * 24 * 3600;

function failsKey(ip: string) {
  return `${NS}fails:${ip}`;
}

function metaKey(ip: string) {
  return `${NS}meta:${ip}`;
}

function lastEmailKey(ip: string) {
  return `${NS}lastemail:${ip}`;
}

export type LoginBruteAssertOpts = {
  lastEmailAttempt?: string | null;
  onEscalateToTier2?: (email: string) => Promise<void>;
};

export async function clearLoginBruteForIp(redis: Redis, ip: string) {
  await redis.del(failsKey(ip), metaKey(ip), lastEmailKey(ip));
}

async function readMeta(redis: Redis, ip: string) {
  const raw = await redis.hgetall(metaKey(ip));
  if (!raw || Object.keys(raw).length === 0) return null;
  const lockUntil = Number(raw.lockUntil);
  const level = Number(raw.lockLevel) || 1;
  const duringLock = Number(raw.duringLock) || 0;
  if (!Number.isFinite(lockUntil) || lockUntil <= 0) return null;
  return { lockUntil, level, duringLock };
}

/** Remove expired lock so the client can try again with a clean ladder. */
async function expireMetaIfNeeded(redis: Redis, ip: string, now: number) {
  const meta = await readMeta(redis, ip);
  if (!meta) return null;
  if (meta.lockUntil > now) return meta;
  await redis.del(metaKey(ip), failsKey(ip), lastEmailKey(ip));
  return null;
}

async function touchLastEmail(
  redis: Redis,
  ip: string,
  email: string | null | undefined
) {
  if (!email || !email.trim()) return;
  const normalized = email.toLowerCase().trim();
  await redis.set(lastEmailKey(ip), normalized, "EX", LAST_EMAIL_TTL_SEC);
}

/**
 * If IP is locked, increments in-lock attempts and may escalate lock; returns lock info.
 * Call from preHandler (after per-route rate limit onRequest) so the reply is not sent twice.
 */
export async function assertLoginNotBruteLocked(
  redis: Redis,
  ip: string,
  opts?: LoginBruteAssertOpts
): Promise<{ locked: true; retryAfterSec: number } | { locked: false }> {
  const now = Date.now();
  const meta = await expireMetaIfNeeded(redis, ip, now);
  if (!meta) return { locked: false };

  await touchLastEmail(redis, ip, opts?.lastEmailAttempt ?? null);

  const mk = metaKey(ip);
  const nextDuring = await redis.hincrby(mk, "duringLock", 1);
  if (nextDuring >= BLOCK_ESCALATE) {
    if (meta.level === 1) {
      await redis.hset(
        mk,
        "lockUntil",
        String(now + LOCK_MS_TIER[1]),
        "lockLevel",
        "2",
        "duringLock",
        "0"
      );
      const email = await redis.get(lastEmailKey(ip));
      if (email && opts?.onEscalateToTier2) {
        await opts.onEscalateToTier2(email);
      }
    } else if (meta.level === 2) {
      await redis.hset(
        mk,
        "lockUntil",
        String(now + LOCK_MS_TIER[2]),
        "lockLevel",
        "3",
        "duringLock",
        "0"
      );
    } else {
      await redis.hset(mk, "duringLock", "0");
    }
  }

  const latest = await readMeta(redis, ip);
  const lockUntil = latest?.lockUntil ?? meta.lockUntil;
  const retryAfterSec = Math.max(1, Math.ceil((lockUntil - now) / 1000));
  return { locked: true, retryAfterSec };
}

/** After a wrong password (or equivalent), track failures and possibly start a lock. */
export async function recordLoginCredentialFailure(
  redis: Redis,
  ip: string,
  email: string
) {
  const now = Date.now();
  const fk = failsKey(ip);
  const mk = metaKey(ip);

  await touchLastEmail(redis, ip, email);

  const meta = await expireMetaIfNeeded(redis, ip, now);
  if (meta && meta.lockUntil > now) return;

  const member = `${now}:${Math.random().toString(36).slice(2, 11)}`;
  await redis.zadd(fk, now, member);
  await redis.zremrangebyscore(fk, 0, now - FAIL_WINDOW_MS);
  const n = await redis.zcard(fk);
  await redis.expire(fk, Math.ceil(FAIL_WINDOW_MS / 1000) + 60);

  if (n >= FAIL_THRESHOLD) {
    await redis
      .multi()
      .del(fk)
      .hset(
        mk,
        "lockUntil",
        String(now + LOCK_MS_TIER[0]),
        "lockLevel",
        "1",
        "duringLock",
        "0"
      )
      .expire(mk, Math.ceil(LOCK_MS_TIER[2] / 1000) + 3600)
      .exec();
  }
}
