import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";
import { createAuthCookie } from "@/lib/auth/cookies";
import { signToken } from "@/lib/auth/jwt";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { refresh_token: refreshToken } = body;
    if (!refreshToken) {
      return NextResponse.json({ error: "refresh_token required" }, { status: 400 });
    }

    const tokenHash = hashToken(refreshToken);
    const record = await prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { account: { include: { faculty: true } } },
    });

    if (!record || new Date() > record.expiresAt) {
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    if (!record.account.isActive) {
      await prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      return NextResponse.json({ error: "Account inactive" }, { status: 401 });
    }

    const accessToken = await signToken({
      accountId: record.account.id,
      email: record.account.email,
      role: record.account.role,
      facultyId: record.account.facultyId,
      isAdmin: record.account.isAdmin,
    });

    const response = NextResponse.json({ access_token: accessToken });
    response.headers.set("Set-Cookie", createAuthCookie(accessToken));
    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
