import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { createCourseTemplateSchema } from "@/lib/validation/schemas/course";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const programIds = await getAccessibleProgramIds(auth.payload);
  const where =
    programIds === null
      ? {}
      : {
          programs: {
            some: { programId: { in: programIds } },
          },
        };

  const templates = await prisma.courseTemplate.findMany({
    where,
    include: { programs: { include: { program: true }, orderBy: { displayOrder: "asc" } } },
    orderBy: { courseCode: "asc" },
  });

  return NextResponse.json({
    data: templates.map((t) => ({
      id: t.id,
      title: t.title,
      course_code: t.courseCode,
      credits: t.credits,
      typically_offered: t.typicallyOffered,
      programs: t.programs.map((p) => ({
        program_id: p.programId,
        program_name: p.program.name,
        display_order: p.displayOrder,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createCourseTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { program_ids, ...data } = parsed.data;
  const programs = await prisma.program.findMany({
    where: { id: { in: program_ids } },
    select: { id: true },
  });
  if (programs.length !== program_ids.length) {
    return NextResponse.json({ error: "One or more programs not found" }, { status: 404 });
  }
  const template = await prisma.courseTemplate.create({
    data: {
      title: data.title,
      courseCode: data.course_code,
      credits: data.credits,
      typicallyOffered: data.typically_offered,
    },
  });

  await prisma.courseTemplateProgram.createMany({
    data: program_ids.map((programId, i) => ({
      courseTemplateId: template.id,
      programId,
      displayOrder: i,
    })),
  });

  const created = await prisma.courseTemplate.findUnique({
    where: { id: template.id },
    include: { programs: { include: { program: true }, orderBy: { displayOrder: "asc" } } },
  });

  return NextResponse.json({
    id: created!.id,
    title: created!.title,
    course_code: created!.courseCode,
    credits: created!.credits,
    typically_offered: created!.typicallyOffered,
    programs: created!.programs.map((p) => ({
      program_id: p.programId,
      program_name: p.program.name,
      display_order: p.displayOrder,
    })),
  });
}
