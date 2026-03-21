import { createHash, randomBytes } from "crypto";

const TOKEN_BYTES = 32;
const HASH_ALG = "sha256";

/**
 * Generate a cryptographically secure token (for invitation links, refresh tokens).
 * Store only the hash; verify by hashing the provided token and comparing.
 */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Hash a token for storage. Never store plaintext tokens.
 */
export function hashToken(token: string): string {
  return createHash(HASH_ALG).update(token).digest("hex");
}

/**
 * Verify a token against a stored hash.
 */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  const hash = hashToken(token);
  return hash === storedHash;
}
