import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { facultyAffiliationSchema } from "@/lib/validation/schemas/faculty";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const faculty = await prisma.faculty.findUnique({
    where: { id },
    include: { programAffiliations: { include: { program: true } } },
  });
  if (!faculty) {
    return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
  }

  if (auth.payload.role === "director") {
    const programIds = await prisma.accountProgramAssociation.findMany({
      where: { accountId: auth.payload.accountId },
      select: { programId: true },
    }).then((r) => r.map((p) => p.programId));
    const hasAccess = faculty.programAffiliations.some((pa) =>
      programIds.includes(pa.programId)
    );
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    data: faculty.programAffiliations.map((pa) => ({
      program_id: pa.programId,
      program_name: pa.program.name,
      is_primary: pa.isPrimary,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const faculty = await prisma.faculty.findUnique({ where: { id } });
  if (!faculty) {
    return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = facultyAffiliationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const program = await prisma.program.findUnique({
    where: { id: parsed.data.program_id },
  });
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  await prisma.facultyProgramAffiliation.upsert({
    where: {
      facultyId_programId: { facultyId: id, programId: parsed.data.program_id },
    },
    create: {
      facultyId: id,
      programId: parsed.data.program_id,
      isPrimary: parsed.data.is_primary ?? false,
    },
    update: { isPrimary: parsed.data.is_primary ?? undefined },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const programId = searchParams.get("program_id");
  if (!programId) {
    return NextResponse.json({ error: "program_id required" }, { status: 400 });
  }

  const existing = await prisma.facultyProgramAffiliation.findUnique({
    where: { facultyId_programId: { facultyId: id, programId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Affiliation not found" }, { status: 404 });
  }

  const remaining = await prisma.facultyProgramAffiliation.count({
    where: { facultyId: id },
  });
  if (remaining <= 1) {
    return NextResponse.json(
      { error: "Faculty must have at least one program affiliation" },
      { status: 400 }
    );
  }

  await prisma.facultyProgramAffiliation.delete({
    where: { facultyId_programId: { facultyId: id, programId } },
  });

  return NextResponse.json({ ok: true });
}
