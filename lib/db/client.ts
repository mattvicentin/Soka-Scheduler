import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Ensure DATABASE_URL is valid before Prisma reads schema env().
 * Vercel + Supabase often set POSTGRES_PRISMA_URL / POSTGRES_URL while DATABASE_URL is empty,
 * mis-linked, or wrapped in stray quotes from the dashboard.
 */
function normalizeDatabaseUrlEnv(): void {
  const strip = (s: string | undefined) => s?.trim().replace(/^["']+|["']+$/g, "") ?? "";
  const isPg = (u: string) => u.startsWith("postgres://") || u.startsWith("postgresql://");

  const current = strip(process.env.DATABASE_URL);
  if (isPg(current)) {
    process.env.DATABASE_URL = current;
    return;
  }
  const fallback = strip(process.env.POSTGRES_PRISMA_URL) || strip(process.env.POSTGRES_URL);
  if (isPg(fallback)) {
    process.env.DATABASE_URL = fallback;
  }
}

normalizeDatabaseUrlEnv();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
