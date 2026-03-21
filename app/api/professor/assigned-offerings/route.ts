import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";

/**
 * GET /api/professor/assigned-offerings
 * Professor only. Returns offerings where professor is instructor.
 * Query: term_id (required)
 * Only includes participates_in_scheduling = true.
 * Includes draft slots for the term when draft schedule version exists.
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const facultyId = auth.payload.facultyId;
  if (!facultyId) {
    return NextResponse.json(
      { error: "Professor account must be linked to faculty" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  if (!termId) {
    return NextResponse.json({ error: "term_id required" }, { status: 400 });
  }

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  const draftVersion = await prisma.scheduleVersion.findUnique({
    where: { termId_mode: { termId, mode: "draft" } },
    select: { id: true },
  });
  const officialVersion = await prisma.scheduleVersion.findUnique({
    where: { termId_mode: { termId, mode: "official" } },
    select: { id: true },
  });
  const slotVersion = draftVersion ?? officialVersion;

  const offerings = await prisma.courseOffering.findMany({
    where: {
      termId,
      participatesInScheduling: true,
      instructors: { some: { facultyId } },
    },
    include: {
      courseTemplate: { include: { programs: { include: { program: true } } } },
      term: true,
      instructors: { include: { faculty: true }, orderBy: { displayOrder: "asc" } },
      scheduleSlots: slotVersion
        ? {
            where: { scheduleVersionId: slotVersion.id },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          }
        : false,
    },
    orderBy: { sectionCode: "asc" },
  });

  const data = offerings.map((o) => {
    const myInstructor = o.instructors.find((i) => i.facultyId === facultyId);
    return {
      id: o.id,
      course_template_id: o.courseTemplateId,
      course_template: {
        title: o.courseTemplate.title,
        course_code: o.courseTemplate.courseCode,
        programs: o.courseTemplate.programs.map((p) => ({
          program_id: p.programId,
          program_name: p.program.name,
        })),
      },
      term_id: o.termId,
      term: {
        name: o.term.name,
        semester: o.term.semester,
        academic_year: o.term.academicYear,
      },
      section_code: o.sectionCode,
      crn: o.crn,
      my_load_share: myInstructor ? Number(myInstructor.loadShare) : null,
      co_instructors: o.instructors
        .filter((i) => i.facultyId !== facultyId)
        .map((i) => ({
          faculty_id: i.facultyId,
          name: i.faculty.name,
          load_share: Number(i.loadShare),
        })),
      slots: o.scheduleSlots
        ? (o.scheduleSlots as Array<{
            id: string;
            dayOfWeek: number;
            startTime: Date;
            endTime: Date;
            buildingPreference: string | null;
            roomPreference: string | null;
            version: number;
          }>).map((s) => ({
            id: s.id,
            day_of_week: s.dayOfWeek,
            start_time: s.startTime.toTimeString().slice(0, 5),
            end_time: s.endTime.toTimeString().slice(0, 5),
            building_preference: s.buildingPreference,
            room_preference: s.roomPreference,
            version: s.version,
          }))
        : [],
    };
  });

  return NextResponse.json({ data });
}
