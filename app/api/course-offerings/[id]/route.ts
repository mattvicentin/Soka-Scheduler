import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { canAccessCourseOffering } from "@/lib/auth/scope";
import { updateCourseOfferingSchema } from "@/lib/validation/schemas/course";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessCourseOffering(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: {
      courseTemplate: { include: { programs: { include: { program: true } } } },
      term: true,
      instructors: { include: { faculty: true }, orderBy: { displayOrder: "asc" } },
    },
  });
  if (!offering) {
    return NextResponse.json({ error: "Course offering not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: offering.id,
    course_template_id: offering.courseTemplateId,
    course_template: {
      title: offering.courseTemplate.title,
      course_code: offering.courseTemplate.courseCode,
      programs: offering.courseTemplate.programs.map((p) => ({
        program_id: p.programId,
        program_name: p.program.name,
      })),
    },
    term_id: offering.termId,
    term: {
      name: offering.term.name,
      semester: offering.term.semester,
      academic_year: offering.term.academicYear,
    },
    section_code: offering.sectionCode,
    crn: offering.crn,
    credits_override: offering.creditsOverride,
    participates_in_scheduling: offering.participatesInScheduling,
    instructors: offering.instructors.map((i) => ({
      id: i.id,
      faculty_id: i.facultyId,
      faculty_name: i.faculty.name,
      role: i.role,
      load_share: Number(i.loadShare),
      display_order: i.displayOrder,
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
  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: { instructors: true },
  });
  if (!offering) {
    return NextResponse.json({ error: "Course offering not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateCourseOfferingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.participates_in_scheduling === true && !offering.participatesInScheduling) {
    const totalShare = offering.instructors.reduce((s, i) => s + Number(i.loadShare), 0);
    if (Math.abs(totalShare - 1) > 0.001) {
      return NextResponse.json(
        {
          error:
            "Cannot set participates_in_scheduling to true: load_share must sum to 1.0. Add or adjust instructors first.",
        },
        { status: 400 }
      );
    }
  }

  await prisma.courseOffering.update({
    where: { id },
    data: {
      sectionCode: parsed.data.section_code,
      crn: parsed.data.crn,
      creditsOverride: parsed.data.credits_override,
      participatesInScheduling: parsed.data.participates_in_scheduling,
    },
  });

  const updated = await prisma.courseOffering.findUnique({
    where: { id },
    include: {
      courseTemplate: { include: { programs: { include: { program: true } } } },
      term: true,
      instructors: { include: { faculty: true }, orderBy: { displayOrder: "asc" } },
    },
  });
  return NextResponse.json({
    id: updated!.id,
    section_code: updated!.sectionCode,
    participates_in_scheduling: updated!.participatesInScheduling,
    instructors: updated!.instructors.map((i) => ({
      id: i.id,
      faculty_id: i.facultyId,
      load_share: Number(i.loadShare),
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
  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: { scheduleSlots: { select: { id: true } } },
  });
  if (!offering) {
    return NextResponse.json({ error: "Course offering not found" }, { status: 404 });
  }
  if (offering.scheduleSlots.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete offering with schedule slots" },
      { status: 400 }
    );
  }

  await prisma.courseOffering.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
