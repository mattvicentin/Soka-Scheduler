import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { canAccessCourseTemplate } from "@/lib/auth/scope";
import { updateCourseTemplateSchema } from "@/lib/validation/schemas/course";

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

  const template = await prisma.courseTemplate.findUnique({
    where: { id },
    include: { programs: { include: { program: true }, orderBy: { displayOrder: "asc" } } },
  });
  if (!template) {
    return NextResponse.json({ error: "Course template not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: template.id,
    title: template.title,
    course_code: template.courseCode,
    credits: template.credits,
    typically_offered: template.typicallyOffered,
    programs: template.programs.map((p) => ({
      program_id: p.programId,
      program_name: p.program.name,
      display_order: p.displayOrder,
    })),
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
  const template = await prisma.courseTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Course template not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateCourseTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await prisma.courseTemplate.update({
    where: { id },
    data: {
      title: parsed.data.title,
      courseCode: parsed.data.course_code,
      credits: parsed.data.credits,
      typicallyOffered: parsed.data.typically_offered,
    },
  });

  const updated = await prisma.courseTemplate.findUnique({
    where: { id },
    include: { programs: { include: { program: true }, orderBy: { displayOrder: "asc" } } },
  });
  return NextResponse.json({
    id: updated!.id,
    title: updated!.title,
    course_code: updated!.courseCode,
    credits: updated!.credits,
    typically_offered: updated!.typicallyOffered,
    programs: updated!.programs.map((p) => ({
      program_id: p.programId,
      program_name: p.program.name,
      display_order: p.displayOrder,
    })),
  });
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
  const template = await prisma.courseTemplate.findUnique({
    where: { id },
    include: { courseOfferings: { select: { id: true } } },
  });
  if (!template) {
    return NextResponse.json({ error: "Course template not found" }, { status: 404 });
  }
  if (template.courseOfferings.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete template with existing offerings" },
      { status: 400 }
    );
  }

  await prisma.courseTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
