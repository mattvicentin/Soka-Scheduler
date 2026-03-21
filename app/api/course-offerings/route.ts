import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { createCourseOfferingSchema } from "@/lib/validation/schemas/course";
import { validateLoad, getLoadUtilizationAdvisory } from "@/lib/services/load";
import {
  validateLoadShareSum,
  getProposedInstructorsForValidation,
} from "@/lib/services/instructor-validation";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const templateId = searchParams.get("course_template_id");
  const participatesInScheduling = searchParams.get("participates_in_scheduling");

  const programIds = await getAccessibleProgramIds(auth.payload);
  const where: Record<string, unknown> = {};
  if (termId) where.termId = termId;
  if (templateId) where.courseTemplateId = templateId;
  if (participatesInScheduling === "true") where.participatesInScheduling = true;
  if (participatesInScheduling === "false") where.participatesInScheduling = false;

  if (programIds !== null) {
    where.courseTemplate = {
      programs: { some: { programId: { in: programIds } } },
    };
  }

  const offerings = await prisma.courseOffering.findMany({
    where,
    include: {
      courseTemplate: { include: { programs: { include: { program: true } } } },
      term: true,
      instructors: { include: { faculty: true }, orderBy: { displayOrder: "asc" } },
    },
    orderBy: [{ termId: "asc" }, { sectionCode: "asc" }],
  });

  return NextResponse.json({
    data: offerings.map((o) => ({
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
      term: { name: o.term.name, semester: o.term.semester, academic_year: o.term.academicYear },
      section_code: o.sectionCode,
      crn: o.crn,
      credits_override: o.creditsOverride,
      participates_in_scheduling: o.participatesInScheduling,
      instructors: o.instructors.map((i) => ({
        id: i.id,
        faculty_id: i.facultyId,
        faculty_name: i.faculty.name,
        role: i.role,
        load_share: Number(i.loadShare),
        display_order: i.displayOrder,
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
  const parsed = createCourseOfferingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const template = await prisma.courseTemplate.findUnique({
    where: { id: parsed.data.course_template_id },
  });
  if (!template) {
    return NextResponse.json({ error: "Course template not found" }, { status: 404 });
  }

  const term = await prisma.term.findUnique({
    where: { id: parsed.data.term_id },
  });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  const offering = await prisma.courseOffering.create({
    data: {
      courseTemplateId: parsed.data.course_template_id,
      termId: parsed.data.term_id,
      sectionCode: parsed.data.section_code,
      crn: parsed.data.crn,
      creditsOverride: parsed.data.credits_override,
      participatesInScheduling: parsed.data.participates_in_scheduling ?? true,
    },
  });

  const instructorFacultyId = parsed.data.instructor_faculty_id;
  const instructorLoadShare = parsed.data.instructor_load_share ?? 1;

  if (instructorFacultyId) {
    const faculty = await prisma.faculty.findUnique({
      where: { id: instructorFacultyId },
    });
    if (faculty) {
      const participatesInScheduling = parsed.data.participates_in_scheduling ?? true;
      if (participatesInScheduling) {
        const proposed = await getProposedInstructorsForValidation(offering.id, {
          type: "add",
          facultyId: instructorFacultyId,
          loadShare: instructorLoadShare,
        });
        const loadShareValid = await validateLoadShareSum(offering.id, proposed);
        if (loadShareValid.valid) {
          const loadValid = await validateLoad(
            instructorFacultyId,
            offering.termId,
            instructorLoadShare,
            undefined
          );
          if (loadValid.valid) {
            await prisma.courseOfferingInstructor.create({
              data: {
                courseOfferingId: offering.id,
                facultyId: instructorFacultyId,
                loadShare: instructorLoadShare,
                displayOrder: 0,
              },
            });
          }
        }
      } else {
        await prisma.courseOfferingInstructor.create({
          data: {
            courseOfferingId: offering.id,
            facultyId: instructorFacultyId,
            loadShare: instructorLoadShare,
            displayOrder: 0,
          },
        });
      }
    }
  }

  const created = await prisma.courseOffering.findUnique({
    where: { id: offering.id },
    include: {
      courseTemplate: { include: { programs: { include: { program: true } } } },
      term: true,
      instructors: { include: { faculty: true } },
    },
  });

  return NextResponse.json({
    id: created!.id,
    course_template_id: created!.courseTemplateId,
    term_id: created!.termId,
    section_code: created!.sectionCode,
    participates_in_scheduling: created!.participatesInScheduling,
    instructors: created!.instructors.map((i) => ({
      id: i.id,
      faculty_id: i.facultyId,
      faculty_name: i.faculty.name,
      load_share: Number(i.loadShare),
    })),
  });
}
