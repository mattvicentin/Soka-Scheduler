const AUTH_COOKIE = "auth_token";
const COOKIE_MAX_AGE = 86400; // 24 hours, matches JWT expiry

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Create Set-Cookie header value for auth token.
 * Secure flag: disabled for localhost, enabled in production.
 */
export function createAuthCookie(token: string): string {
  const secure = isProduction() ? "; Secure" : "";
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

/**
 * Create Set-Cookie header to clear auth cookie.
 */
export function clearAuthCookie(): string {
  const secure = isProduction() ? "; Secure" : "";
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
