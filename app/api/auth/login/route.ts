import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { createAuthCookie } from "@/lib/auth/cookies";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    let account: { id: string; email: string; role: string; facultyId: string | null; isAdmin: boolean } | null = null;

    // Admin login (environment-based credentials)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && email === adminEmail && adminPassword && password === adminPassword) {
      account = await prisma.account.findUnique({
        where: { email: adminEmail },
      });
      if (!account) {
        const passwordHash = await hashPassword(adminPassword);
        const created = await prisma.account.create({
          data: {
            email: adminEmail,
            passwordHash,
            role: "dean",
            isAdmin: true,
          },
        });
        account = created;
      }
    }

    // Faculty/director login (DB-backed)
    if (!account) {
      const found = await prisma.account.findUnique({
        where: { email, isActive: true },
        include: { faculty: true },
      });
      if (!found?.passwordHash) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      const valid = await verifyPassword(password, found.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      account = found;
    }

    const accessToken = await signToken({
      accountId: account.id,
      email: account.email,
      role: account.role as "professor" | "director" | "dean",
      facultyId: account.facultyId,
      isAdmin: account.isAdmin,
    });

    const refreshTokenPlain = generateSecureToken();
    const refreshTokenHash = hashToken(refreshTokenPlain);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        accountId: account.id,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    const response = NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshTokenPlain,
      expires_in: 86400,
    });
    response.headers.set("Set-Cookie", createAuthCookie(accessToken));
    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
