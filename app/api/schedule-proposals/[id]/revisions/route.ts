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
 * GET /api/schedule-proposals/:id/revisions
 * Director and dean only — audit log when draft slots are edited on this proposal.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const canAccess = await canAccessProposal(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const revisions = await prisma.proposalRevisionLog.findMany({
    where: { scheduleProposalId: id },
    include: { editedBy: { select: { email: true } } },
    orderBy: { editedAt: "desc" },
  });

  return NextResponse.json({
    data: revisions.map((r) => ({
      id: r.id,
      edited_at: r.editedAt.toISOString(),
      edited_by_email: r.editedBy.email,
      changes_summary: r.changesSummary,
    })),
  });
}
