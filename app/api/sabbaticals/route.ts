import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { createSabbaticalSchema } from "@/lib/validation/schemas/sabbatical";

/**
 * GET /api/sabbaticals
 * Dean only. Query: faculty_id?, term_id?
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const facultyId = searchParams.get("faculty_id");
  const termId = searchParams.get("term_id");

  const where: Record<string, unknown> = {};
  if (facultyId) where.facultyId = facultyId;
  if (termId) where.termId = termId;

  const sabbaticals = await prisma.sabbatical.findMany({
    where,
    include: { faculty: true, term: true },
    orderBy: [{ termId: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    data: sabbaticals.map((s) => ({
      id: s.id,
      faculty_id: s.facultyId,
      faculty_name: s.faculty.name,
      term_id: s.termId,
      term_name: s.term.name,
      type: s.type,
      reason: s.reason,
      effective_load_reduction: Number(s.effectiveLoadReduction),
    })),
  });
}

/**
 * POST /api/sabbaticals
 * Dean only.
 */
export async function POST(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createSabbaticalSchema.safeParse(body);
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

  const term = await prisma.term.findUnique({
    where: { id: parsed.data.term_id },
  });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  const existing = await prisma.sabbatical.findFirst({
    where: {
      facultyId: parsed.data.faculty_id,
      termId: parsed.data.term_id,
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Sabbatical already exists for this faculty/term" },
      { status: 409 }
    );
  }

  const sabbatical = await prisma.sabbatical.create({
    data: {
      facultyId: parsed.data.faculty_id,
      termId: parsed.data.term_id,
      type: parsed.data.type,
      reason: parsed.data.reason,
      effectiveLoadReduction: parsed.data.effective_load_reduction,
    },
    include: { faculty: true, term: true },
  });

  return NextResponse.json({
    id: sabbatical.id,
    faculty_id: sabbatical.facultyId,
    faculty_name: sabbatical.faculty.name,
    term_id: sabbatical.termId,
    term_name: sabbatical.term.name,
    type: sabbatical.type,
    effective_load_reduction: Number(sabbatical.effectiveLoadReduction),
  });
}
