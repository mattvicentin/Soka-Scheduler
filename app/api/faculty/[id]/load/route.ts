import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/middleware";
import { canAccessFaculty } from "@/lib/auth/scope";
import { getTermIdsForLoadPeriod, getCurrentLoad, getEffectiveCapacity } from "@/lib/services/load";

/**
 * GET /api/faculty/:id/load
 * Director, Dean. Query: term_id (required for period).
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
  const canAccess = await canAccessFaculty(auth.payload, id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  if (!termId) {
    return NextResponse.json({ error: "term_id required" }, { status: 400 });
  }

  const termIds = await getTermIdsForLoadPeriod(termId);
  const [currentLoad, capacity] = await Promise.all([
    getCurrentLoad(id, termIds),
    getEffectiveCapacity(id, termIds),
  ]);

  return NextResponse.json({
    faculty_id: id,
    term_id: termId,
    current_load: currentLoad,
    effective_capacity: capacity,
    remaining: Math.max(0, capacity - currentLoad),
  });
}
