import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["director", "dean"]);
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

  return NextResponse.json({
    id: version.id,
    term_id: version.termId,
    term: {
      name: version.term.name,
      semester: version.term.semester,
      academic_year: version.term.academicYear,
    },
    mode: version.mode,
    version_number: version.versionNumber,
  });
}
