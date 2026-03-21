import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { getConfigWithDefault } from "@/lib/config";
import { CONFIG_KEYS } from "@/lib/constants/config-keys";
import type { VerificationCodePurpose } from "@prisma/client";

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 60;
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;

/**
 * Generate a 6-digit verification code.
 */
function generateCode(): string {
  const buf = randomBytes(CODE_LENGTH);
  return Array.from(buf, (b) => String(b % 10)).join("");
}

/**
 * Hash a verification code for storage.
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Create a verification code for an account. Returns the plaintext code (send via email).
 * Does not delete old codes (verify uses most recent; enables rate limit by request count).
 */
export async function createVerificationCode(
  accountId: string,
  purpose: VerificationCodePurpose
): Promise<string> {
  const expiryMinutes = await getConfigWithDefault(
    CONFIG_KEYS.VERIFICATION_CODE_EXPIRY_MINUTES,
    15
  );
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  const code = generateCode();
  const codeHash = hashCode(code);

  await prisma.verificationCode.create({
    data: {
      accountId,
      codeHash,
      expiresAt,
      purpose,
    },
  });

  return code;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked" }
  | { ok: false; reason: "rate_limited" };

/**
 * Verify a 6-digit code. Handles rate limiting and lockout.
 */
export async function verifyCode(
  accountId: string,
  code: string,
  purpose: VerificationCodePurpose
): Promise<VerifyResult> {
  const record = await prisma.verificationCode.findFirst({
    where: { accountId, purpose },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { ok: false, reason: "invalid" };
  }

  if (record.attemptCount >= MAX_ATTEMPTS) {
    const lockoutEnd = new Date(record.createdAt.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    if (new Date() < lockoutEnd) {
      return { ok: false, reason: "locked" };
    }
    await prisma.verificationCode.delete({ where: { id: record.id } });
    return { ok: false, reason: "invalid" };
  }

  if (new Date() > record.expiresAt) {
    await prisma.verificationCode.delete({ where: { id: record.id } });
    return { ok: false, reason: "expired" };
  }

  const codeHash = hashCode(code);
  if (codeHash !== record.codeHash) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attemptCount: record.attemptCount + 1 },
    });
    if (record.attemptCount + 1 >= RATE_LIMIT_ATTEMPTS) {
      return { ok: false, reason: "rate_limited" };
    }
    return { ok: false, reason: "invalid" };
  }

  await prisma.verificationCode.delete({ where: { id: record.id } });
  return { ok: true };
}

/**
 * Check if account is rate-limited (too many recent failed attempts).
 */
export async function isRateLimited(accountId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recent = await prisma.verificationCode.findMany({
    where: { accountId, createdAt: { gte: cutoff } },
  });
  const totalAttempts = recent.reduce((acc, r) => acc + r.attemptCount, 0);
  return totalAttempts >= RATE_LIMIT_ATTEMPTS;
}

const MAX_CODE_REQUESTS_PER_WINDOW = 3;

/**
 * Check if account has requested too many verification codes recently.
 */
export async function isCodeRequestRateLimited(accountId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const count = await prisma.verificationCode.count({
    where: { accountId, createdAt: { gte: cutoff } },
  });
  return count >= MAX_CODE_REQUESTS_PER_WINDOW;
}
