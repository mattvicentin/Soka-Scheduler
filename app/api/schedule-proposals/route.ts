import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";

/**
 * GET /api/schedule-proposals
 * Professors: own only. Directors: program scope. Deans: all.
 * Query: term_id, status
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const status = searchParams.get("status");

  let where: Record<string, unknown> = {};
  if (termId) where.termId = termId;
  if (status) where.status = status;

  if (auth.payload.role === "professor") {
    if (!auth.payload.facultyId) {
      return NextResponse.json({ data: [] });
    }
    where.facultyId = auth.payload.facultyId;
  } else if (auth.payload.role === "director") {
    const programIds = await getAccessibleProgramIds(auth.payload);
    if (!programIds || programIds.length === 0) {
      return NextResponse.json({ data: [] });
    }
    where.faculty = {
      programAffiliations: { some: { programId: { in: programIds } } },
    };
  }

  const proposals = await prisma.scheduleProposal.findMany({
    where,
    include: {
      faculty: {
        include: { account: { select: { role: true } } },
      },
      term: true,
    },
    orderBy: [{ termId: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    data: proposals.map((p) => ({
      id: p.id,
      faculty_id: p.facultyId,
      faculty_name: p.faculty.name,
      term_id: p.termId,
      term: { name: p.term.name, semester: p.term.semester, academic_year: p.term.academicYear },
      status: p.status,
      submitted_at: p.submittedAt?.toISOString() ?? null,
      needs_dean_approval:
        auth.payload.role === "dean" &&
        p.faculty.account?.role === "director" &&
        (p.status === "under_review" || p.status === "revised"),
    })),
  });
}

/**
 * POST /api/schedule-proposals
 * Professor only. Body: { term_id }. Creates draft or returns existing.
 */
export async function POST(request: Request) {
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

  const body = await request.json();
  const termId = body?.term_id;
  if (!termId || typeof termId !== "string") {
    return NextResponse.json({ error: "term_id required" }, { status: 400 });
  }

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  const existing = await prisma.scheduleProposal.findUnique({
    where: { facultyId_termId: { facultyId, termId } },
    include: { term: true },
  });
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      faculty_id: existing.facultyId,
      term_id: existing.termId,
      term: { name: existing.term.name, semester: existing.term.semester, academic_year: existing.term.academicYear },
      status: existing.status,
      submitted_at: existing.submittedAt?.toISOString() ?? null,
    });
  }

  const proposal = await prisma.scheduleProposal.create({
    data: { facultyId, termId },
    include: { term: true },
  });

  return NextResponse.json({
    id: proposal.id,
    faculty_id: proposal.facultyId,
    term_id: proposal.termId,
    term: { name: proposal.term.name, semester: proposal.term.semester, academic_year: proposal.term.academicYear },
    status: proposal.status,
    submitted_at: null,
  });
}
