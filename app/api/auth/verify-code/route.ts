import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyCode } from "@/lib/auth/verification";
import { signToken } from "@/lib/auth/jwt";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { createAuthCookie } from "@/lib/auth/cookies";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, code, purpose } = body;
    if (!email || !code || !purpose) {
      return NextResponse.json(
        { error: "Email, code, and purpose required" },
        { status: 400 }
      );
    }

    if (purpose !== "account_setup" && purpose !== "sensitive_action") {
      return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { email: email.toLowerCase() },
      include: { faculty: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const result = await verifyCode(account.id, String(code).trim(), purpose);

    if (!result.ok) {
      switch (result.reason) {
        case "expired":
          return NextResponse.json({ error: "Verification code expired" }, { status: 400 });
        case "invalid":
          return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
        case "locked":
          return NextResponse.json(
            { error: "Too many attempts. Please try again in 1 hour." },
            { status: 429 }
          );
        case "rate_limited":
          return NextResponse.json(
            { error: "Too many attempts. Please request a new code." },
            { status: 429 }
          );
      }
    }

    const accessToken = await signToken({
      accountId: account.id,
      email: account.email,
      role: account.role,
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
