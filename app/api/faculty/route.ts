import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { createFacultySchema } from "@/lib/validation/schemas/faculty";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("program_id");
    const excluded = searchParams.get("excluded");

    const programIds = await getAccessibleProgramIds(auth.payload);

    let where: Prisma.FacultyWhereInput = {};
    if (excluded === "true") where.isExcluded = true;
    if (excluded === "false") where.isExcluded = false;

    if (auth.payload.isAdmin || auth.payload.role === "dean") {
      if (programId) {
        where.programAffiliations = { some: { programId } };
      }
    } else if (programIds && programIds.length > 0) {
      where.programAffiliations = { some: { programId: { in: programIds } } };
      if (programId && programIds.includes(programId)) {
        where.programAffiliations = { some: { programId } };
      }
    } else {
      return NextResponse.json({ data: [] });
    }

    const faculty = await prisma.faculty.findMany({
      where,
      include: {
        programAffiliations: { include: { program: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      data: faculty.map((f) => ({
        id: f.id,
        email: f.email,
        name: f.name,
        expected_annual_load: f.expectedAnnualLoad,
        load_exception_reason: f.loadExceptionReason,
        building_preference_default: f.buildingPreferenceDefault,
        room_preference_default: f.roomPreferenceDefault,
        is_excluded: f.isExcluded,
        program_affiliations: f.programAffiliations.map((pa) => ({
          program_id: pa.programId,
          program_name: pa.program.name,
          is_primary: pa.isPrimary,
        })),
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

  try {
    const body = await request.json();
    const parsed = createFacultySchema.safeParse(body);
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
    const faculty = await prisma.faculty.create({
      data: {
        email: data.email,
        name: data.name,
        expectedAnnualLoad: data.expected_annual_load,
        loadExceptionReason: data.load_exception_reason,
        buildingPreferenceDefault: data.building_preference_default,
        roomPreferenceDefault: data.room_preference_default,
      },
    });

    if (program_ids.length > 0) {
      await prisma.facultyProgramAffiliation.createMany({
        data: program_ids.map((programId, i) => ({
          facultyId: faculty.id,
          programId,
          isPrimary: i === 0,
        })),
      });
    }

    const course_offering_ids = parsed.data.course_offering_ids ?? [];
    if (course_offering_ids.length > 0) {
      const offerings = await prisma.courseOffering.findMany({
        where: { id: { in: course_offering_ids } },
        select: { id: true, termId: true, participatesInScheduling: true },
      });
      for (const off of offerings) {
        const existing = await prisma.courseOfferingInstructor.findUnique({
          where: {
            courseOfferingId_facultyId: { courseOfferingId: off.id, facultyId: faculty.id },
          },
        });
        if (!existing) {
          await prisma.courseOfferingInstructor.create({
            data: {
              courseOfferingId: off.id,
              facultyId: faculty.id,
              loadShare: 1,
              displayOrder: 0,
            },
          });
        }
      }
    }

    const created = await prisma.faculty.findUnique({
      where: { id: faculty.id },
      include: { programAffiliations: { include: { program: true } } },
    });

    return NextResponse.json({
      id: created!.id,
      email: created!.email,
      name: created!.name,
      expected_annual_load: created!.expectedAnnualLoad,
      program_affiliations: created!.programAffiliations.map((pa) => ({
        program_id: pa.programId,
        program_name: pa.program.name,
        is_primary: pa.isPrimary,
      })),
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
