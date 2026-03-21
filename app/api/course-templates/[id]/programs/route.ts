import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { canAccessCourseTemplate } from "@/lib/auth/scope";
import { accountProgramSchema } from "@/lib/validation/schemas/account";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessCourseTemplate(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const programs = await prisma.courseTemplateProgram.findMany({
    where: { courseTemplateId: id },
    include: { program: true },
    orderBy: { displayOrder: "asc" },
  });

  return NextResponse.json({
    data: programs.map((p) => ({
      program_id: p.programId,
      program_name: p.program.name,
      display_order: p.displayOrder,
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
  const template = await prisma.courseTemplate.findUnique({
    where: { id },
    include: { programs: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Course template not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = accountProgramSchema.safeParse(body);
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

  const existing = template.programs.find((p) => p.programId === parsed.data.program_id);
  if (existing) {
    return NextResponse.json({ error: "Program already associated" }, { status: 409 });
  }

  const maxOrder = template.programs.reduce((m, p) => Math.max(m, p.displayOrder), -1);
  await prisma.courseTemplateProgram.create({
    data: {
      courseTemplateId: id,
      programId: parsed.data.program_id,
      displayOrder: maxOrder + 1,
    },
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

  const existing = await prisma.courseTemplateProgram.findUnique({
    where: { courseTemplateId_programId: { courseTemplateId: id, programId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Association not found" }, { status: 404 });
  }

  const remaining = await prisma.courseTemplateProgram.count({
    where: { courseTemplateId: id },
  });
  if (remaining <= 1) {
    return NextResponse.json(
      { error: "Template must have at least one program" },
      { status: 400 }
    );
  }

  await prisma.courseTemplateProgram.delete({
    where: { courseTemplateId_programId: { courseTemplateId: id, programId } },
  });

  return NextResponse.json({ ok: true });
}
