import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const accounts = await prisma.account.findMany({
      where: { isAdmin: false },
      include: {
        faculty: { select: { id: true, name: true, email: true } },
        programAssocs: { include: { program: true } },
      },
      orderBy: { email: "asc" },
    });

    return NextResponse.json({
      data: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        role: a.role,
        is_active: a.isActive,
        faculty: a.faculty
          ? { id: a.faculty.id, name: a.faculty.name, email: a.faculty.email }
          : null,
        program_associations: a.programAssocs.map((pa) => ({
          program_id: pa.programId,
          program_name: pa.program.name,
        })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
