import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { createSlotSchema } from "@/lib/validation/schemas/slot";
import { validateSlotPlacement } from "@/lib/services/slot-validation";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/schedule-slots
 * Professor: only slots for courses they teach.
 * Director, Dean: program-scoped. Query: term_id, schedule_version_id, program_id? (required for director)
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const scheduleVersionId = searchParams.get("schedule_version_id");
  const programId = searchParams.get("program_id");

  if (!termId || !scheduleVersionId) {
    return NextResponse.json(
      { error: "term_id and schedule_version_id required" },
      { status: 400 }
    );
  }

  let where: Record<string, unknown>;

  if (auth.payload.role === "professor" && auth.payload.facultyId) {
    // Professor: only slots for offerings where they are instructor
    where = {
      termId,
      scheduleVersionId,
      courseOffering: {
        participatesInScheduling: true,
        instructors: { some: { facultyId: auth.payload.facultyId } },
      },
    };
  } else {
    const programIds = await getAccessibleProgramIds(auth.payload);
    if (auth.payload.role === "director" && (!programIds || programIds.length === 0)) {
      return NextResponse.json({ error: "Director must have program associations" }, { status: 403 });
    }
    if (programId && programIds !== null && !programIds.includes(programId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const programFilter = programId
      ? { some: { programId } }
      : programIds === null
        ? {}
        : { some: { programId: { in: programIds } } };
    where = {
      termId,
      scheduleVersionId,
      courseOffering: {
        participatesInScheduling: true,
        courseTemplate: {
          programs: programFilter,
        },
      },
    };
  }

  const slots = await prisma.scheduleSlot.findMany({
    where,
    include: {
      courseOffering: {
        include: {
          courseTemplate: { include: { programs: { include: { program: true } } } },
          instructors: { include: { faculty: true }, orderBy: { displayOrder: "asc" } },
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json({
    data: slots.map((s) => ({
      id: s.id,
      course_offering_id: s.courseOfferingId,
      term_id: s.termId,
      schedule_version_id: s.scheduleVersionId,
      day_of_week: s.dayOfWeek,
      start_time: s.startTime.toTimeString().slice(0, 5),
      end_time: s.endTime.toTimeString().slice(0, 5),
      building_preference: s.buildingPreference,
      room_preference: s.roomPreference,
      version: s.version,
      course_offering: {
        course_code: s.courseOffering.courseTemplate.courseCode,
        title: s.courseOffering.courseTemplate.title,
        section_code: s.courseOffering.sectionCode,
        instructors: s.courseOffering.instructors.map((i) => ({
          faculty_id: i.facultyId,
          name: i.faculty.name,
          load_share: Number(i.loadShare),
        })),
      },
    })),
  });
}

/**
 * POST /api/schedule-slots
 * Professor: only for offerings they teach.
 * Director, Dean: program-scoped offerings.
 */
export async function POST(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id: parsed.data.course_offering_id },
    include: {
      term: true,
      courseTemplate: { include: { programs: true } },
      instructors: { select: { facultyId: true } },
    },
  });
  if (!offering) {
    return NextResponse.json({ error: "Course offering not found" }, { status: 404 });
  }
  if (!offering.participatesInScheduling) {
    return NextResponse.json(
      { error: "Cannot create slots for non-scheduling offerings" },
      { status: 400 }
    );
  }

  if (auth.payload.role === "professor" && auth.payload.facultyId) {
    const isInstructor = offering.instructors.some((i) => i.facultyId === auth.payload.facultyId);
    if (!isInstructor) {
      return NextResponse.json({ error: "You can only create slots for courses you teach" }, { status: 403 });
    }
  } else {
    const programIds = await getAccessibleProgramIds(auth.payload);
    if (programIds !== null) {
      const hasProgram = offering.courseTemplate.programs.some((p) =>
        programIds.includes(p.programId)
      );
      if (!hasProgram) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const version = await prisma.scheduleVersion.findUnique({
    where: { id: parsed.data.schedule_version_id },
  });
  if (!version) {
    return NextResponse.json({ error: "Schedule version not found" }, { status: 404 });
  }
  if (version.mode !== "draft") {
    return NextResponse.json(
      { error: "Can only create slots in draft schedule" },
      { status: 400 }
    );
  }
  if (version.termId !== offering.termId) {
    return NextResponse.json({ error: "Version term mismatch" }, { status: 400 });
  }

  const [startH, startM] = parsed.data.start_time.split(":").map(Number);
  const [endH, endM] = parsed.data.end_time.split(":").map(Number);
  const startTime = new Date(2000, 0, 1, startH, startM, 0);
  const endTime = new Date(2000, 0, 1, endH, endM, 0);

  const validation = await validateSlotPlacement(
    parsed.data.schedule_version_id,
    parsed.data.day_of_week,
    startTime,
    endTime,
    undefined,
    offering.id,
    auth.payload.facultyId
  );
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: { errors: validation.errors, warnings: validation.warnings },
      },
      { status: 422 }
    );
  }

  const slot = await prisma.scheduleSlot.create({
    data: {
      courseOfferingId: offering.id,
      termId: offering.termId,
      scheduleVersionId: parsed.data.schedule_version_id,
      dayOfWeek: parsed.data.day_of_week,
      startTime,
      endTime,
      buildingPreference: parsed.data.building_preference ?? undefined,
      roomPreference: parsed.data.room_preference ?? undefined,
    },
    include: {
      courseOffering: {
        include: {
          courseTemplate: true,
          instructors: { include: { faculty: true } },
        },
      },
    },
  });

  await logAudit("slot_create", auth.payload.accountId, "schedule_slot", slot.id);

  return NextResponse.json({
    id: slot.id,
    day_of_week: slot.dayOfWeek,
    start_time: slot.startTime.toTimeString().slice(0, 5),
    end_time: slot.endTime.toTimeString().slice(0, 5),
    warnings: validation.warnings,
    course_offering: {
      course_code: slot.courseOffering.courseTemplate.courseCode,
      section_code: slot.courseOffering.sectionCode,
      instructors: slot.courseOffering.instructors.map((i) => i.faculty.name),
    },
  });
}
