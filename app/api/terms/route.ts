import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { createTermSchema } from "@/lib/validation/schemas/course";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const terms = await prisma.term.findMany({
      orderBy: [{ academicYear: "desc" }, { semester: "asc" }],
    });

    return NextResponse.json({
      data: terms.map((t) => ({
        id: t.id,
        name: t.name,
        semester: t.semester,
        academic_year: t.academicYear,
        start_date: t.startDate?.toISOString().slice(0, 10) ?? null,
        end_date: t.endDate?.toISOString().slice(0, 10) ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createTermSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const startDate = parsed.data.start_date
    ? new Date(parsed.data.start_date)
    : undefined;
  const endDate = parsed.data.end_date ? new Date(parsed.data.end_date) : undefined;

  try {
    const term = await prisma.term.create({
      data: {
        name: parsed.data.name,
        semester: parsed.data.semester,
        academicYear: parsed.data.academic_year,
        startDate,
        endDate,
      },
    });

    return NextResponse.json({
      id: term.id,
      name: term.name,
      semester: term.semester,
      academic_year: term.academicYear,
      start_date: term.startDate?.toISOString().slice(0, 10) ?? null,
      end_date: term.endDate?.toISOString().slice(0, 10) ?? null,
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: "Term with this academic_year and semester already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
