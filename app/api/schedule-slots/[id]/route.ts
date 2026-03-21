import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import type { AuthScopePayload } from "@/lib/auth/scope";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { updateSlotSchema } from "@/lib/validation/schemas/slot";
import { validateSlotPlacement } from "@/lib/services/slot-validation";
import type { ValidationResult } from "@/lib/validation/types";
import { logAudit } from "@/lib/audit";

async function canAccessSlot(payload: AuthScopePayload, slotId: string): Promise<boolean> {
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: slotId },
    include: {
      courseOffering: {
        include: {
          courseTemplate: { include: { programs: true } },
          instructors: { select: { facultyId: true } },
        },
      },
    },
  });
  if (!slot) return false;
  if (payload.role === "professor" && payload.facultyId) {
    return slot.courseOffering.instructors.some((i) => i.facultyId === payload.facultyId);
  }
  const programIds = await getAccessibleProgramIds(payload);
  if (programIds === null) return true;
  const hasProgram = slot.courseOffering.courseTemplate.programs.some((p) =>
    programIds.includes(p.programId)
  );
  return hasProgram;
}

/**
 * PATCH /api/schedule-slots/:id
 * Professor, Director, Dean. Optimistic lock via version.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessSlot(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slot = await prisma.scheduleSlot.findUnique({
    where: { id },
    include: { courseOffering: true, scheduleVersion: true },
  });
  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  if (slot.scheduleVersion.mode !== "draft") {
    return NextResponse.json(
      { error: "Can only edit slots in draft schedule" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = updateSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const dayOfWeek = parsed.data.day_of_week ?? slot.dayOfWeek;
  let startTime = slot.startTime;
  let endTime = slot.endTime;
  if (parsed.data.start_time) {
    const [h, m] = parsed.data.start_time.split(":").map(Number);
    startTime = new Date(2000, 0, 1, h, m, 0);
  }
  if (parsed.data.end_time) {
    const [h, m] = parsed.data.end_time.split(":").map(Number);
    endTime = new Date(2000, 0, 1, h, m, 0);
  }

  let slotValidation: ValidationResult | null = null;
  if (parsed.data.day_of_week !== undefined || parsed.data.start_time !== undefined || parsed.data.end_time !== undefined) {
    slotValidation = await validateSlotPlacement(
      slot.scheduleVersionId,
      dayOfWeek,
      startTime,
      endTime,
      id,
      slot.courseOfferingId,
      auth.payload.facultyId
    );
    if (!slotValidation.valid) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: { errors: slotValidation.errors, warnings: slotValidation.warnings },
        },
        { status: 422 }
      );
    }
  }

  const updated = await prisma.scheduleSlot.update({
    where: { id },
    data: {
      dayOfWeek: parsed.data.day_of_week,
      startTime: parsed.data.start_time ? startTime : undefined,
      endTime: parsed.data.end_time ? endTime : undefined,
      buildingPreference: parsed.data.building_preference,
      roomPreference: parsed.data.room_preference,
      version: { increment: 1 },
    },
  });

  await logAudit("slot_update", auth.payload.accountId, "schedule_slot", id);

  return NextResponse.json({
    id: updated.id,
    day_of_week: updated.dayOfWeek,
    start_time: updated.startTime.toTimeString().slice(0, 5),
    end_time: updated.endTime.toTimeString().slice(0, 5),
    building_preference: updated.buildingPreference,
    room_preference: updated.roomPreference,
    version: updated.version,
    warnings: slotValidation?.warnings ?? [],
  });
}

/**
 * DELETE /api/schedule-slots/:id
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessSlot(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slot = await prisma.scheduleSlot.findUnique({
    where: { id },
    include: { scheduleVersion: true },
  });
  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }
  if (slot.scheduleVersion.mode !== "draft") {
    return NextResponse.json(
      { error: "Can only delete slots in draft schedule" },
      { status: 400 }
    );
  }

  await prisma.scheduleSlot.delete({ where: { id } });
  await logAudit("slot_delete", auth.payload.accountId, "schedule_slot", id);
  return NextResponse.json({ ok: true });
}
