import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/schedule-versions/:id/publish
 * Dean only. Copies draft slots to official. Sets all proposals for term to published.
 * Audit: publish_schedule per proposal (or term).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const version = await prisma.scheduleVersion.findUnique({
    where: { id },
    include: { term: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Schedule version not found" }, { status: 404 });
  }
  if (version.mode !== "draft") {
    return NextResponse.json(
      { error: "Can only publish from draft version" },
      { status: 400 }
    );
  }

  const officialVersion = await prisma.scheduleVersion.findUnique({
    where: { termId_mode: { termId: version.termId, mode: "official" } },
  });
  if (!officialVersion) {
    return NextResponse.json(
      { error: "Official schedule version does not exist for this term" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleSlot.deleteMany({
      where: { scheduleVersionId: officialVersion.id },
    });

    const draftSlots = await tx.scheduleSlot.findMany({
      where: { scheduleVersionId: id },
    });

    for (const slot of draftSlots) {
      await tx.scheduleSlot.create({
        data: {
          courseOfferingId: slot.courseOfferingId,
          termId: slot.termId,
          scheduleVersionId: officialVersion.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          buildingPreference: slot.buildingPreference,
          roomPreference: slot.roomPreference,
        },
      });
    }

    await tx.historicalOffering.deleteMany({
      where: { termId: version.termId },
    });

    const slotsWithOfferings = await tx.scheduleSlot.findMany({
      where: { scheduleVersionId: officialVersion.id },
      include: {
        courseOffering: {
          include: { instructors: { select: { facultyId: true } } },
        },
      },
    });
    for (const slot of slotsWithOfferings) {
      for (const inst of slot.courseOffering.instructors) {
        await tx.historicalOffering.create({
          data: {
            facultyId: inst.facultyId,
            courseOfferingId: slot.courseOfferingId,
            termId: slot.termId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
        });
      }
    }

    const proposals = await tx.scheduleProposal.findMany({
      where: { termId: version.termId, status: "finalized" },
    });

    for (const p of proposals) {
      await tx.scheduleProposal.update({
        where: { id: p.id },
        data: { status: "published" },
      });
      await logAudit("publish_schedule", auth.payload.accountId, "schedule_proposal", p.id);
    }
  });

  return NextResponse.json({
    ok: true,
    message: "Draft slots copied to official; finalized proposals set to published",
  });
}
