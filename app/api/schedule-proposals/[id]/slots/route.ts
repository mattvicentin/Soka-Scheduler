import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import type { AuthScopePayload } from "@/lib/auth/scope";
import { getAccessibleProgramIds } from "@/lib/auth/scope";

async function canAccessProposal(payload: AuthScopePayload, proposalId: string): Promise<boolean> {
  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id: proposalId },
    select: { facultyId: true },
  });
  if (!proposal) return false;
  if (payload.isAdmin || payload.role === "dean") return true;
  if (payload.role === "professor" && payload.facultyId === proposal.facultyId) return true;
  if (payload.role === "director") {
    const programIds = await getAccessibleProgramIds(payload);
    if (!programIds?.length) return false;
    const hasAffil = await prisma.facultyProgramAffiliation.findFirst({
      where: { facultyId: proposal.facultyId, programId: { in: programIds } },
    });
    return !!hasAffil;
  }
  return false;
}

/**
 * GET /api/schedule-proposals/:id/slots
 * Draft schedule slots for this proposal's faculty in the proposal term (director/dean/professor review).
 * Not limited by director program scope so reviewers see all of the faculty member's proposed slots.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessProposal(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id },
    select: { termId: true, facultyId: true },
  });
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const draftVersion = await prisma.scheduleVersion.findUnique({
    where: {
      termId_mode: { termId: proposal.termId, mode: "draft" },
    },
  });

  if (!draftVersion) {
    return NextResponse.json({ data: [] });
  }

  const slots = await prisma.scheduleSlot.findMany({
    where: {
      scheduleVersionId: draftVersion.id,
      termId: proposal.termId,
      courseOffering: {
        participatesInScheduling: true,
        instructors: { some: { facultyId: proposal.facultyId } },
      },
    },
    include: {
      courseOffering: {
        include: {
          courseTemplate: true,
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
