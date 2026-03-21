import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/", "/login", "/accept-invitation", "/verify"];
const AUTH_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/validate-invitation",
  "/api/auth/accept-invitation",
  "/api/auth/verify-code",
  "/api/auth/request-verification-code",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAuthApi(pathname: string): boolean {
  return AUTH_API_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Files in /public must be reachable without auth (logos, etc.) */
function isPublicStaticAsset(pathname: string): boolean {
  if (pathname.startsWith("/logos/")) return true;
  return /\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?)$/i.test(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") && isAuthApi(pathname)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("Authorization");
  const token =
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ??
    request.cookies.get("auth_token")?.value ??
    null;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await verifyToken(token);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
