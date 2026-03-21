import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { canAccessCourseOffering } from "@/lib/auth/scope";
import { instructorSchema } from "@/lib/validation/schemas/course";
import { validateLoad, getLoadUtilizationAdvisory } from "@/lib/services/load";
import {
  validateLoadShareSum,
  getProposedInstructorsForValidation,
} from "@/lib/services/instructor-validation";

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

  const instructors = await prisma.courseOfferingInstructor.findMany({
    where: { courseOfferingId: id },
    include: { faculty: true },
    orderBy: { displayOrder: "asc" },
  });

  return NextResponse.json({
    data: instructors.map((i) => ({
      id: i.id,
      faculty_id: i.facultyId,
      faculty_name: i.faculty.name,
      role: i.role,
      load_share: Number(i.loadShare),
      display_order: i.displayOrder,
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
  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    select: { id: true, termId: true, participatesInScheduling: true },
  });
  if (!offering) {
    return NextResponse.json({ error: "Course offering not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = instructorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const faculty = await prisma.faculty.findUnique({
    where: { id: parsed.data.faculty_id },
  });
  if (!faculty) {
    return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
  }

  const existing = await prisma.courseOfferingInstructor.findUnique({
    where: {
      courseOfferingId_facultyId: { courseOfferingId: id, facultyId: parsed.data.faculty_id },
    },
  });
  if (existing) {
    return NextResponse.json({ error: "Instructor already assigned" }, { status: 409 });
  }

  if (offering.participatesInScheduling) {
    const proposed = await getProposedInstructorsForValidation(id, {
      type: "add",
      facultyId: parsed.data.faculty_id,
      loadShare: parsed.data.load_share,
    });
    const loadShareValid = await validateLoadShareSum(id, proposed);
    if (!loadShareValid.valid) {
      return NextResponse.json({ error: loadShareValid.message }, { status: 400 });
    }

    const loadValid = await validateLoad(
      parsed.data.faculty_id,
      offering.termId,
      parsed.data.load_share,
      undefined
    );
    if (!loadValid.valid) {
      return NextResponse.json({ error: loadValid.message }, { status: 400 });
    }
  }

  const warnings: string[] = [];
  if (offering.participatesInScheduling) {
    const advisory = await getLoadUtilizationAdvisory(
      parsed.data.faculty_id,
      offering.termId,
      parsed.data.load_share,
      undefined
    );
    if (advisory.nearCapacity && advisory.message) {
      warnings.push(advisory.message);
    }
  }

  const maxOrder = await prisma.courseOfferingInstructor
    .aggregate({
      where: { courseOfferingId: id },
      _max: { displayOrder: true },
    })
    .then((r) => r._max.displayOrder ?? -1);

  const instructor = await prisma.courseOfferingInstructor.create({
    data: {
      courseOfferingId: id,
      facultyId: parsed.data.faculty_id,
      role: parsed.data.role,
      loadShare: parsed.data.load_share,
      displayOrder: parsed.data.display_order ?? maxOrder + 1,
    },
    include: { faculty: true },
  });

  return NextResponse.json({
    id: instructor.id,
    faculty_id: instructor.facultyId,
    faculty_name: instructor.faculty.name,
    role: instructor.role,
    load_share: Number(instructor.loadShare),
    display_order: instructor.displayOrder,
    ...(warnings.length > 0 && { warnings }),
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
  const { searchParams } = new URL(request.url);
  const instructorId = searchParams.get("instructor_id");
  if (!instructorId) {
    return NextResponse.json({ error: "instructor_id required" }, { status: 400 });
  }

  const instructor = await prisma.courseOfferingInstructor.findUnique({
    where: { id: instructorId },
    include: { courseOffering: true },
  });
  if (!instructor || instructor.courseOfferingId !== id) {
    return NextResponse.json({ error: "Instructor not found" }, { status: 404 });
  }

  if (instructor.courseOffering.participatesInScheduling) {
    const proposed = await getProposedInstructorsForValidation(id, {
      type: "remove",
      facultyId: instructor.facultyId,
    });
    const loadShareValid = await validateLoadShareSum(id, proposed);
    if (!loadShareValid.valid) {
      return NextResponse.json(
        {
          error:
            "Cannot remove instructor: load_share would not sum to 1.0. Add or adjust other instructors first.",
        },
        { status: 400 }
      );
    }
  }

  await prisma.courseOfferingInstructor.delete({
    where: { id: instructorId },
  });

  return NextResponse.json({ ok: true });
}
