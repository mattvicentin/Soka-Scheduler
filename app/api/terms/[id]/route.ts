import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { updateTermSchema } from "@/lib/validation/schemas/course";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const term = await prisma.term.findUnique({ where: { id } });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: term.id,
    name: term.name,
    semester: term.semester,
    academic_year: term.academicYear,
    start_date: term.startDate?.toISOString().slice(0, 10) ?? null,
    end_date: term.endDate?.toISOString().slice(0, 10) ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const term = await prisma.term.findUnique({ where: { id } });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateTermSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.term.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.start_date !== undefined && {
        startDate: parsed.data.start_date ? new Date(parsed.data.start_date) : null,
      }),
      ...(parsed.data.end_date !== undefined && {
        endDate: parsed.data.end_date ? new Date(parsed.data.end_date) : null,
      }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    semester: updated.semester,
    academic_year: updated.academicYear,
    start_date: updated.startDate?.toISOString().slice(0, 10) ?? null,
    end_date: updated.endDate?.toISOString().slice(0, 10) ?? null,
  });
}
