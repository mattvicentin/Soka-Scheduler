import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { updateInstructorSchema } from "@/lib/validation/schemas/course";
import { validateLoad } from "@/lib/services/load";
import {
  validateLoadShareSum,
  getProposedInstructorsForValidation,
} from "@/lib/services/instructor-validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; instructorId: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id, instructorId } = await params;
  const instructor = await prisma.courseOfferingInstructor.findUnique({
    where: { id: instructorId },
    include: { courseOffering: true, faculty: true },
  });
  if (!instructor || instructor.courseOfferingId !== id) {
    return NextResponse.json({ error: "Instructor not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateInstructorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (instructor.courseOffering.participatesInScheduling && parsed.data.load_share !== undefined) {
    const proposed = await getProposedInstructorsForValidation(id, {
      type: "update",
      facultyId: instructor.facultyId,
      loadShare: parsed.data.load_share,
    });
    const loadShareValid = await validateLoadShareSum(id, proposed);
    if (!loadShareValid.valid) {
      return NextResponse.json({ error: loadShareValid.message }, { status: 400 });
    }

    const loadValid = await validateLoad(
      instructor.facultyId,
      instructor.courseOffering.termId,
      parsed.data.load_share,
      id
    );
    if (!loadValid.valid) {
      return NextResponse.json({ error: loadValid.message }, { status: 400 });
    }
  }

  const updated = await prisma.courseOfferingInstructor.update({
    where: { id: instructorId },
    data: {
      role: parsed.data.role,
      loadShare: parsed.data.load_share,
      displayOrder: parsed.data.display_order,
    },
    include: { faculty: true },
  });

  return NextResponse.json({
    id: updated.id,
    faculty_id: updated.facultyId,
    faculty_name: updated.faculty.name,
    role: updated.role,
    load_share: Number(updated.loadShare),
    display_order: updated.displayOrder,
  });
}
