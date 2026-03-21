import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import { getHeatmapData } from "@/lib/services/heatmap";

/**
 * GET /api/heatmap
 * Professor: own slots only. Director, Dean: program-scoped.
 * Query: term_id, schedule_version_id, program_id? (director/dean)
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const scheduleVersionId = searchParams.get("schedule_version_id");
  const programId = searchParams.get("program_id");

  if (!termId || !scheduleVersionId) {
    return NextResponse.json(
      { error: "term_id and schedule_version_id required" },
      { status: 400 }
    );
  }

  if (auth.payload.role !== "professor") {
    const programIds = await getAccessibleProgramIds(auth.payload);
    if (programId && programIds !== null && !programIds.includes(programId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const data = await getHeatmapData(
    termId,
    scheduleVersionId,
    programId ?? undefined,
    auth.payload
  );

  return NextResponse.json({ data });
}
