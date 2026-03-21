import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { CONFIG_KEYS } from "@/lib/constants/config-keys";

/**
 * GET /api/settings
 * Dean only. Returns schedule-related settings for the dean dashboard.
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const row = await prisma.systemConfig.findUnique({
    where: { key: CONFIG_KEYS.CROWDED_PERIOD_POLICY },
  });
  const value = (row?.value as string) ?? "warn";
  const crowded_period_policy = value === "block" ? "block" : "warn";

  return NextResponse.json({
    faculty_conflict_policy: crowded_period_policy,
    crowded_period_policy,
  });
}

/**
 * PATCH /api/settings
 * Dean only. Updates schedule-related settings.
 * Body: { crowded_period_policy?: "warn" | "block" } or legacy { faculty_conflict_policy?: "warn" | "block" }
 */
export async function PATCH(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const policy = body?.crowded_period_policy ?? body?.faculty_conflict_policy;
  if (policy !== undefined) {
    if (policy !== "warn" && policy !== "block") {
      return NextResponse.json(
        { error: "crowded_period_policy must be 'warn' or 'block'" },
        { status: 400 }
      );
    }
    await prisma.systemConfig.upsert({
      where: { key: CONFIG_KEYS.CROWDED_PERIOD_POLICY },
      update: { value: policy },
      create: { key: CONFIG_KEYS.CROWDED_PERIOD_POLICY, value: policy },
    });
  }

  const row = await prisma.systemConfig.findUnique({
    where: { key: CONFIG_KEYS.CROWDED_PERIOD_POLICY },
  });
  const value = (row?.value as string) ?? "warn";
  const crowded_period_policy = value === "block" ? "block" : "warn";

  return NextResponse.json({
    faculty_conflict_policy: crowded_period_policy,
    crowded_period_policy,
  });
}
