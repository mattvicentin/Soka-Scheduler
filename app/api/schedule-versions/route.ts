import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { scheduleVersionSchema } from "@/lib/validation/schemas/course";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");

  const where = termId ? { termId } : {};
  const versions = await prisma.scheduleVersion.findMany({
    where,
    include: { term: true },
    orderBy: [{ termId: "asc" }, { versionNumber: "desc" }],
  });

  return NextResponse.json({
    data: versions.map((v) => ({
      id: v.id,
      term_id: v.termId,
      term: { name: v.term.name, semester: v.term.semester, academic_year: v.term.academicYear },
      mode: v.mode,
      version_number: v.versionNumber,
    })),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = scheduleVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const auth =
    parsed.data.mode === "official"
      ? await requireRole(request, ["dean"])
      : await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const term = await prisma.term.findUnique({
    where: { id: parsed.data.term_id },
  });
  if (!term) {
    return NextResponse.json({ error: "Term not found" }, { status: 404 });
  }

  const existing = await prisma.scheduleVersion.findUnique({
    where: {
      termId_mode: { termId: parsed.data.term_id, mode: parsed.data.mode },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Schedule version for term ${parsed.data.term_id} with mode ${parsed.data.mode} already exists` },
      { status: 409 }
    );
  }

  const version = await prisma.scheduleVersion.create({
    data: {
      termId: parsed.data.term_id,
      mode: parsed.data.mode,
      versionNumber: 1,
    },
    include: { term: true },
  });

  return NextResponse.json({
    id: version.id,
    term_id: version.termId,
    term: { name: version.term.name, semester: version.term.semester, academic_year: version.term.academicYear },
    mode: version.mode,
    version_number: version.versionNumber,
  });
}
