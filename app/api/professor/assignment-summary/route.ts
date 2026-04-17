import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import type { ProposalStatus } from "@prisma/client";

/**
 * GET /api/professor/assignment-summary
 * Professor only. Assigned courses grouped by term, with per-course slot counts and progress.
 * Step "preferences in submitted proposal" is per course (requires slots); director/dean steps follow the single term proposal.
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const facultyId = auth.payload.facultyId;
  if (!facultyId) {
    return NextResponse.json(
      { error: "Professor account must be linked to faculty" },
      { status: 403 }
    );
  }

  const offerings = await prisma.courseOffering.findMany({
    where: {
      participatesInScheduling: true,
      instructors: { some: { facultyId } },
    },
    select: {
      id: true,
      sectionCode: true,
      termId: true,
      courseTemplate: { select: { courseCode: true, title: true } },
      term: { select: { id: true, name: true, semester: true, academicYear: true } },
    },
    orderBy: [{ termId: "desc" }, { sectionCode: "asc" }],
  });

  const termIds = Array.from(new Set(offerings.map((o) => o.termId)));
  const proposals =
    termIds.length === 0
      ? []
      : await prisma.scheduleProposal.findMany({
          where: { facultyId, termId: { in: termIds } },
          select: { id: true, termId: true, status: true, submittedAt: true },
        });
  const proposalByTerm = new Map(proposals.map((p) => [p.termId, p]));

  const versions = await prisma.scheduleVersion.findMany({
    where: { termId: { in: termIds } },
    select: { id: true, termId: true, mode: true },
  });
  const versionIdByTerm = new Map<string, string>();
  for (const termId of termIds) {
    const draft = versions.find((v) => v.termId === termId && v.mode === "draft");
    const official = versions.find((v) => v.termId === termId && v.mode === "official");
    const id = draft?.id ?? official?.id;
    if (id) versionIdByTerm.set(termId, id);
  }

  const slotCountByOffering = new Map<string, number>();
  for (const termId of termIds) {
    const versionId = versionIdByTerm.get(termId);
    if (!versionId) continue;
    const idsInTerm = offerings.filter((o) => o.termId === termId).map((o) => o.id);
    if (idsInTerm.length === 0) continue;
    const grouped = await prisma.scheduleSlot.groupBy({
      by: ["courseOfferingId"],
      where: {
        scheduleVersionId: versionId,
        courseOfferingId: { in: idsInTerm },
      },
      _count: { _all: true },
    });
    for (const g of grouped) {
      slotCountByOffering.set(g.courseOfferingId, g._count._all);
    }
  }

  function globalDirectorApproved(status: ProposalStatus | null): boolean {
    if (!status) return false;
    return ["approved", "finalized", "published"].includes(status);
  }

  function globalDeanFinalized(status: ProposalStatus | null): boolean {
    if (!status) return false;
    return ["finalized", "published"].includes(status);
  }

  /** Proposal has been sent for review (or beyond); draft stays false for step 1 until submitted. */
  function proposalPastDraft(status: ProposalStatus | null): boolean {
    if (!status) return false;
    return status !== "draft";
  }

  const byTerm = new Map<
    string,
    {
      term_id: string;
      term_name: string;
      academic_year: number;
      semester: string;
      proposal: { id: string | null; status: ProposalStatus | null };
      courses: Array<{
        id: string;
        course_code: string;
        title: string;
        section_code: string;
        slot_count: number;
        progress: {
          preferences_in_submitted_proposal: boolean;
          director_approved: boolean;
          dean_finalized: boolean;
        };
      }>;
    }
  >();

  for (const o of offerings) {
    let row = byTerm.get(o.termId);
    if (!row) {
      const prop = proposalByTerm.get(o.termId);
      row = {
        term_id: o.termId,
        term_name: o.term.name,
        academic_year: o.term.academicYear,
        semester: o.term.semester,
        proposal: { id: prop?.id ?? null, status: prop?.status ?? null },
        courses: [],
      };
      byTerm.set(o.termId, row);
    }
    const propStatus = row.proposal.status;
    const slotCount = slotCountByOffering.get(o.id) ?? 0;
    const preferencesInSubmitted = proposalPastDraft(propStatus) && slotCount > 0;
    const hasPrefs = slotCount > 0;
    row.courses.push({
      id: o.id,
      course_code: o.courseTemplate.courseCode,
      title: o.courseTemplate.title,
      section_code: o.sectionCode,
      slot_count: slotCount,
      progress: {
        preferences_in_submitted_proposal: preferencesInSubmitted,
        director_approved: hasPrefs && globalDirectorApproved(propStatus),
        dean_finalized: hasPrefs && globalDeanFinalized(propStatus),
      },
    });
  }

  const semRank = (s: string) => (s === "spring" ? 1 : 0);
  const data = Array.from(byTerm.values()).sort((a, b) => {
    if (a.academic_year !== b.academic_year) return b.academic_year - a.academic_year;
    return semRank(b.semester) - semRank(a.semester);
  });

  return NextResponse.json({
    data: data.map(({ academic_year, semester, ...row }) => row),
  });
}
