import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import type { ProposalStatus } from "@prisma/client";

/**
 * GET /api/professor/assignment-summary
 * Professor only. Assigned courses (dean assignments) grouped by term, plus proposal progress per term.
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

  type Progress = {
    submitted: boolean;
    director_approved: boolean;
    dean_finalized: boolean;
    status: ProposalStatus | null;
    proposal_id: string | null;
  };

  function progressForStatus(status: ProposalStatus | null): Progress {
    if (!status) {
      return {
        submitted: false,
        director_approved: false,
        dean_finalized: false,
        status: null,
        proposal_id: null,
      };
    }
    const submitted =
      status !== "draft" &&
      ["submitted", "under_review", "revised", "approved", "finalized", "published"].includes(status);
    const directorApproved = ["approved", "finalized", "published"].includes(status);
    const deanFinalized = ["finalized", "published"].includes(status);
    return {
      submitted,
      director_approved: directorApproved,
      dean_finalized: deanFinalized,
      status,
      proposal_id: null,
    };
  }

  const byTerm = new Map<
    string,
    {
      term_id: string;
      term_name: string;
      academic_year: number;
      semester: string;
      courses: Array<{ id: string; course_code: string; title: string; section_code: string }>;
      progress: Progress;
    }
  >();

  for (const o of offerings) {
    let row = byTerm.get(o.termId);
    if (!row) {
      const prop = proposalByTerm.get(o.termId);
      const base = progressForStatus(prop?.status ?? null);
      row = {
        term_id: o.termId,
        term_name: o.term.name,
        academic_year: o.term.academicYear,
        semester: o.term.semester,
        courses: [],
        progress: { ...base, proposal_id: prop?.id ?? null },
      };
      byTerm.set(o.termId, row);
    }
    row.courses.push({
      id: o.id,
      course_code: o.courseTemplate.courseCode,
      title: o.courseTemplate.title,
      section_code: o.sectionCode,
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
