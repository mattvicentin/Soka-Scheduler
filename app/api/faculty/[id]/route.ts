import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { canAccessFaculty } from "@/lib/auth/scope";
import { updateFacultySchema } from "@/lib/validation/schemas/faculty";
import { logAudit } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessFaculty(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const faculty = await prisma.faculty.findUnique({
    where: { id },
    include: { programAffiliations: { include: { program: true } } },
  });
  if (!faculty) {
    return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: faculty.id,
    email: faculty.email,
    name: faculty.name,
    expected_annual_load: faculty.expectedAnnualLoad,
    load_exception_reason: faculty.loadExceptionReason,
    building_preference_default: faculty.buildingPreferenceDefault,
    room_preference_default: faculty.roomPreferenceDefault,
    is_excluded: faculty.isExcluded,
    program_affiliations: faculty.programAffiliations.map((pa) => ({
      program_id: pa.programId,
      program_name: pa.program.name,
      is_primary: pa.isPrimary,
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
  const faculty = await prisma.faculty.findUnique({ where: { id } });
  if (!faculty) {
    return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateFacultySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const isExcluded = data.is_excluded !== undefined ? data.is_excluded : faculty.isExcluded;

  await prisma.$transaction(async (tx) => {
    const prevExcluded = faculty.isExcluded;
    await tx.faculty.update({
      where: { id },
      data: {
        email: data.email,
        name: data.name,
        expectedAnnualLoad: data.expected_annual_load,
        loadExceptionReason: data.load_exception_reason,
        buildingPreferenceDefault: data.building_preference_default,
        roomPreferenceDefault: data.room_preference_default,
        isExcluded: data.is_excluded,
      },
    });
    if (data.is_excluded !== undefined && data.is_excluded !== prevExcluded) {
      await logAudit(
        data.is_excluded ? "exclude_faculty" : "include_faculty",
        auth.payload.accountId,
        "faculty",
        id
      );
    }
  });

  const updated = await prisma.faculty.findUnique({
    where: { id },
    include: { programAffiliations: { include: { program: true } } },
  });
  return NextResponse.json({
    id: updated!.id,
    email: updated!.email,
    name: updated!.name,
    expected_annual_load: updated!.expectedAnnualLoad,
    is_excluded: updated!.isExcluded,
    program_affiliations: updated!.programAffiliations.map((pa) => ({
      program_id: pa.programId,
      program_name: pa.program.name,
      is_primary: pa.isPrimary,
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
  const faculty = await prisma.faculty.findUnique({ where: { id } });
  if (!faculty) {
    return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
  }

  // CourseOfferingInstructor uses onDelete: Restrict — remove assignments first.
  await prisma.$transaction([
    prisma.courseOfferingInstructor.deleteMany({ where: { facultyId: id } }),
    prisma.faculty.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
