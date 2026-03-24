import { NextResponse } from "next/server";
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db/client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { createAuthCookie } from "@/lib/auth/cookies";

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export async function POST(request: Request) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error(
        "[auth/login] JWT_SECRET is not set — add it in Vercel → Settings → Environment Variables (Production and Preview)."
      );
      return NextResponse.json(
        {
          error:
            "Sign-in is not configured on this deployment (missing JWT_SECRET). Add it in Vercel environment variables and redeploy.",
        },
        { status: 503 }
      );
    }

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
  } catch (e) {
    console.error("[auth/login]", e);

    if (e instanceof PrismaClientInitializationError) {
      return NextResponse.json(
        {
          error:
            "Cannot connect to the database. In Vercel, set DATABASE_URL to your hosted Postgres URL (often add ?sslmode=require), apply to Production, and redeploy.",
          detail: e.message,
        },
        { status: 503 }
      );
    }

    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === "P1001" || e.code === "P1017") {
        return NextResponse.json(
          {
            error:
              "Database unreachable from this server. Check DATABASE_URL, allow Vercel IPs if your DB is IP-restricted, and use your provider’s serverless/pooled connection string if they offer one.",
          },
          { status: 503 }
        );
      }
      if (e.code === "P2021" || e.code === "P1003") {
        return NextResponse.json(
          {
            error:
              "Database is empty or out of date. From your machine with the same DATABASE_URL: run npx prisma migrate deploy (and npm run db:seed if you need accounts).",
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
