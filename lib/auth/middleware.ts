import { getSession, getTokenFromRequest } from "./session";
import type { AccountRole } from "@prisma/client";
import type { JwtPayload } from "./jwt";

export type AuthResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; status: 401; message: string }
  | { ok: false; status: 403; message: string };

/**
 * Require valid auth. Returns payload or error response.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  const payload = await getSession(request);
  if (!payload) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true, payload };
}

/**
 * Require auth and specific role(s).
 */
export async function requireRole(
  request: Request,
  roles: AccountRole | AccountRole[]
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(auth.payload.role)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  return auth;
}

/**
 * Require auth and program access (for Directors).
 * Call after requireRole. Dean/isAdmin bypass program check.
 */
export function requireProgramAccess(
  payload: JwtPayload,
  programIds: string[]
): { ok: true } | { ok: false; status: 403; message: string } {
  if (payload.isAdmin || payload.role === "dean") {
    return { ok: true };
  }
  // Director: must have program in their associations (checked at query time)
  // This is a placeholder; actual program IDs come from DB
  if (programIds.length === 0) {
    return { ok: false, status: 403, message: "No program access" };
  }
  return { ok: true };
}
