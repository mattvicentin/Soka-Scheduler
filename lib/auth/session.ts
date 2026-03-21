import { verifyToken, type JwtPayload } from "./jwt";

const BEARER_PREFIX = "Bearer ";
const AUTH_COOKIE = "auth_token";

/**
 * Extract token from request: Authorization header or cookie.
 */
export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith(BEARER_PREFIX)) {
    return authHeader.slice(BEARER_PREFIX.length);
  }
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

export async function getSession(request: Request): Promise<JwtPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export function getAuthHeader(request: Request): string | null {
  return request.headers.get("Authorization");
}

export { AUTH_COOKIE };
