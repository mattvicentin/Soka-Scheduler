import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";
import { clearAuthCookie } from "@/lib/auth/cookies";

export async function POST(request: Request) {
  try {
    let body: { refresh_token?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body - just clear cookie
    }
    const refreshToken = body?.refresh_token;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", clearAuthCookie());
    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
