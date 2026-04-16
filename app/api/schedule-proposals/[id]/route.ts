import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import type { AuthScopePayload } from "@/lib/auth/scope";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { validateSlotPlacement } from "@/lib/services/slot-validation";

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
 * GET /api/schedule-proposals/:id
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
    include: {
      faculty: { select: { id: true, name: true, email: true } },
      term: true,
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: proposal.id,
    faculty_id: proposal.facultyId,
    faculty_name: proposal.faculty.name,
    term_id: proposal.termId,
    term: { name: proposal.term.name, semester: proposal.term.semester, academic_year: proposal.term.academicYear },
    status: proposal.status,
    submitted_at: proposal.submittedAt?.toISOString() ?? null,
    approved_by_account_id: proposal.approvedByAccountId,
    finalized_by_account_id: proposal.finalizedByAccountId,
  });
}

/**
 * PATCH /api/schedule-proposals/:id
 * Professor: submit (status: submitted) when draft; or slot_preferences.
 * Director: status transitions (under_review, revised, approved, draft).
 * Dean: status transitions including finalized, published.
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
  const canAccess = await canAccessProposal(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id },
    include: { faculty: true },
  });
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const body = await request.json();
  const status = body?.status;
  const slotPreferences = body?.slot_preferences as
    | Array<{ slot_id: string; building_preference?: string | null; room_preference?: string | null }>
    | undefined;
  const slotEdits = body?.slot_edits as
    | Array<{
        slot_id: string;
        day_of_week?: number;
        start_time?: string;
        end_time?: string;
        building_preference?: string | null;
        room_preference?: string | null;
      }>
    | undefined;

  if (auth.payload.role === "professor") {
    if (proposal.facultyId !== auth.payload.facultyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (status === "submitted") {
      if (proposal.status !== "draft") {
        return NextResponse.json(
          { error: "Can only submit a draft proposal" },
          { status: 400 }
        );
      }
      await prisma.scheduleProposal.update({
        where: { id },
        data: { status: "submitted", submittedAt: new Date() },
      });
      const updated = await prisma.scheduleProposal.findUnique({
        where: { id },
        include: { term: true },
      });
      return NextResponse.json({
        id: updated!.id,
        status: updated!.status,
        submitted_at: updated!.submittedAt?.toISOString() ?? null,
      });
    }
    if (slotPreferences && proposal.status === "draft") {
      const draftVersion = await prisma.scheduleVersion.findUnique({
        where: { termId_mode: { termId: proposal.termId, mode: "draft" } },
      });
      if (!draftVersion) {
        return NextResponse.json(
          { error: "No draft schedule for this term" },
          { status: 400 }
        );
      }
      for (const pref of slotPreferences) {
        const slot = await prisma.scheduleSlot.findFirst({
          where: {
            id: pref.slot_id,
            scheduleVersionId: draftVersion.id,
            courseOffering: {
              instructors: { some: { facultyId: auth.payload.facultyId } },
            },
          },
        });
        if (slot) {
          const BUILDING_VALUES = ["ikeda", "gandhi", "pauling", "curie", "maathai", "other"] as const;
          const buildingVal =
            pref.building_preference === null || pref.building_preference === ""
              ? null
              : BUILDING_VALUES.includes(pref.building_preference as (typeof BUILDING_VALUES)[number])
                ? (pref.building_preference as (typeof BUILDING_VALUES)[number])
                : undefined;
          await prisma.scheduleSlot.update({
            where: { id: pref.slot_id },
            data: {
              ...(buildingVal !== undefined && { buildingPreference: buildingVal }),
              ...(pref.room_preference !== undefined && {
                roomPreference: pref.room_preference === "" ? null : pref.room_preference,
              }),
            },
          });
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (status || slotPreferences) {
      return NextResponse.json(
        { error: "Professors can only submit (status: submitted) or edit slot preferences when draft" },
        { status: 400 }
      );
    }
  }

  if (auth.payload.role === "director" || auth.payload.role === "dean") {
    if (slotEdits && slotEdits.length > 0) {
      if (auth.payload.role === "dean" && proposal.status === "submitted") {
        return NextResponse.json(
          {
            error:
              "This proposal is awaiting program director review. A director must pick it up before the dean can edit slots.",
          },
          { status: 403 }
        );
      }
      const draftVersion = await prisma.scheduleVersion.findUnique({
        where: { termId_mode: { termId: proposal.termId, mode: "draft" } },
      });
      if (!draftVersion) {
        return NextResponse.json(
          { error: "No draft schedule for this term" },
          { status: 400 }
        );
      }
      const changes: string[] = [];
      for (const edit of slotEdits) {
        // Same scope as GET .../schedule-proposals/:id/slots: any draft slot for this faculty
        // in the proposal term (not limited to director's programs), so directors can adjust times.
        const slot = await prisma.scheduleSlot.findFirst({
          where: {
            id: edit.slot_id,
            scheduleVersionId: draftVersion.id,
            courseOffering: {
              instructors: { some: { facultyId: proposal.facultyId } },
              participatesInScheduling: true,
            },
          },
          include: { courseOffering: { include: { courseTemplate: true } } },
        });
        if (!slot) continue;

        const updates: Record<string, unknown> = {};
        if (edit.day_of_week !== undefined) updates.dayOfWeek = edit.day_of_week;
        if (edit.building_preference !== undefined)
          updates.buildingPreference =
            edit.building_preference === "" || edit.building_preference === null
              ? null
              : edit.building_preference;
        if (edit.room_preference !== undefined)
          updates.roomPreference = edit.room_preference === "" ? null : edit.room_preference;

        let startTime = slot.startTime;
        let endTime = slot.endTime;
        if (edit.start_time) {
          const [h, m] = edit.start_time.split(":").map(Number);
          startTime = new Date(2000, 0, 1, h, m, 0);
          updates.startTime = startTime;
        }
        if (edit.end_time) {
          const [h, m] = edit.end_time.split(":").map(Number);
          endTime = new Date(2000, 0, 1, h, m, 0);
          updates.endTime = endTime;
        }
        const dayOfWeek = edit.day_of_week ?? slot.dayOfWeek;

        if (edit.day_of_week !== undefined || edit.start_time !== undefined || edit.end_time !== undefined) {
          const validation = await validateSlotPlacement(
            draftVersion.id,
            dayOfWeek,
            startTime,
            endTime,
            slot.id,
            slot.courseOfferingId,
            proposal.facultyId
          );
          if (!validation.valid) {
            return NextResponse.json(
              { error: "Validation failed", details: validation.errors },
              { status: 422 }
            );
          }
        }

        if (Object.keys(updates).length > 0) {
          await prisma.scheduleSlot.update({
            where: { id: slot.id },
            data: { ...updates, version: { increment: 1 } },
          });
          changes.push(
            `${slot.courseOffering.courseTemplate.courseCode} ${slot.courseOffering.sectionCode}: ${JSON.stringify(edit)}`
          );
        }
      }
      if (changes.length > 0) {
        const newStatus =
          proposal.status === "under_review" ? "revised" : proposal.status;
        await prisma.$transaction([
          prisma.scheduleProposal.update({
            where: { id },
            data: newStatus === "revised" ? { status: "revised" } : {},
          }),
          prisma.proposalRevisionLog.create({
            data: {
              scheduleProposalId: id,
              editedByAccountId: auth.payload.accountId,
              changesSummary: { changes } as object,
            },
          }),
        ]);
        const updated = await prisma.scheduleProposal.findUnique({
          where: { id },
          select: { status: true },
        });
        return NextResponse.json({
          ok: true,
          status: updated?.status,
          revisions_logged: changes.length,
        });
      }
      return NextResponse.json(
        {
          error:
            "No slot updates were applied. The slot may not belong to this faculty member’s draft schedule, or no fields changed.",
        },
        { status: 400 }
      );
    }

    const validTransitions: Record<string, string[]> = {
      submitted: ["under_review"],
      under_review: ["revised", "approved", "draft"],
      // After director edits slots, status becomes "revised"; must still allow approve/reject.
      revised: ["under_review", "approved", "draft"],
      // Dean may finalize or send back to director for another pass.
      approved: ["finalized", "under_review"],
      finalized: ["published"],
      draft: ["submitted"],
    };
    if (status && validTransitions[proposal.status]?.includes(status)) {
      if (proposal.status === "submitted" && status === "under_review" && auth.payload.role !== "director") {
        return NextResponse.json(
          {
            error: "Only a program director can accept a newly submitted proposal for review.",
          },
          { status: 403 }
        );
      }
      if (proposal.status === "approved" && status === "under_review") {
        if (auth.payload.role !== "dean") {
          return NextResponse.json(
            { error: "Only a dean can return an approved proposal to the director." },
            { status: 403 }
          );
        }
      }
      if (status === "approved") {
        const approverAccount = await prisma.account.findUnique({
          where: { id: auth.payload.accountId },
          include: { faculty: true },
        });
        const isOwnProposal =
          approverAccount?.facultyId === proposal.facultyId;
        if (isOwnProposal && auth.payload.role === "director") {
          return NextResponse.json(
            { error: "Director cannot approve own proposal" },
            { status: 403 }
          );
        }
      }
      const updateData: Record<string, unknown> = { status };
      if (status === "approved") updateData.approvedByAccountId = auth.payload.accountId;
      if (status === "under_review" && proposal.status === "approved") {
        updateData.approvedByAccountId = null;
      }
      if (status === "finalized") updateData.finalizedByAccountId = auth.payload.accountId;
      await prisma.scheduleProposal.update({
        where: { id },
        data: updateData,
      });
      const updated = await prisma.scheduleProposal.findUnique({
        where: { id },
        include: { term: true },
      });
      return NextResponse.json({
        id: updated!.id,
        status: updated!.status,
      });
    }

    // Explain why the PATCH was rejected (avoid generic "Invalid update").
    if (status) {
      const allowed = validTransitions[proposal.status];
      if (!allowed?.length) {
        return NextResponse.json(
          {
            error: `Cannot change proposal status from "${proposal.status}" using this action.`,
            details: { current_status: proposal.status, requested_status: status },
          },
          { status: 400 }
        );
      }
      if (!allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Cannot set status to "${status}" while the proposal is "${proposal.status}".`,
            details: {
              current_status: proposal.status,
              requested_status: status,
              allowed_next_statuses: allowed,
            },
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error:
          "This update is not allowed. Send a valid `status` for the current proposal state, or `slot_edits` to adjust draft slots.",
        details: {
          current_status: proposal.status,
          hint:
            auth.payload.role === "director" || auth.payload.role === "dean"
              ? "Directors: use Approve / Reject for status changes, or edit slots in the list first."
              : undefined,
        },
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      error: "This action is not allowed for your role.",
      details: { role: auth.payload.role },
    },
    { status: 400 }
  );
}
