import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/middleware";
import { OTHERS_PROGRAM_NAME, PROGRAM_CATALOG } from "@/lib/constants/programs-catalog";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const programs = await prisma.program.findMany({
      include: {
        director: { select: { id: true, email: true } },
      },
    });

    const catalogOrder = new Map(PROGRAM_CATALOG.map((p, i) => [p.name, i]));
    programs.sort((a, b) => {
      if (a.name === OTHERS_PROGRAM_NAME) return 1;
      if (b.name === OTHERS_PROGRAM_NAME) return -1;
      const ia = catalogOrder.get(a.name);
      const ib = catalogOrder.get(b.name);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      data: programs.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        director: p.director
          ? { id: p.director.id, email: p.director.email }
          : null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
