import { createHash, randomBytes } from "crypto";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
