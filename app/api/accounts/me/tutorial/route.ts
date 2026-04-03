import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/middleware";
import type { Account } from "@prisma/client";

function tourFieldForAccount(account: Pick<Account, "role" | "isAdmin">): keyof Pick<
  Account,
  "professorTourCompletedAt" | "directorTourCompletedAt" | "deanTourCompletedAt"
> {
  if (account.isAdmin || account.role === "dean") {
    return "deanTourCompletedAt";
  }
  if (account.role === "director") {
    return "directorTourCompletedAt";
  }
  return "professorTourCompletedAt";
}

/** Mark the current dashboard tour as completed (or skipped). Role is derived from the authenticated account. */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const account = await prisma.account.findUnique({
      where: { id: auth.payload.accountId },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const field = tourFieldForAccount(account);
    const updated = await prisma.account.update({
      where: { id: account.id },
      data: { [field]: new Date() },
      select: {
        professorTourCompletedAt: true,
        directorTourCompletedAt: true,
        deanTourCompletedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      professor_tour_completed_at: updated.professorTourCompletedAt?.toISOString() ?? null,
      director_tour_completed_at: updated.directorTourCompletedAt?.toISOString() ?? null,
      dean_tour_completed_at: updated.deanTourCompletedAt?.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
