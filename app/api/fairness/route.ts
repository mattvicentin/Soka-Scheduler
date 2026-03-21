import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import {
  getFairnessForFaculty,
  getFairnessForFacultyList,
} from "@/lib/services/fairness";

/**
 * GET /api/fairness
 * Professors: own only (faculty_id ignored).
 * Directors: program scope. Deans: all.
 * Query: faculty_id?, program_id?
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["professor", "director", "dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const facultyIdParam = searchParams.get("faculty_id");
  const programIdParam = searchParams.get("program_id");

  if (auth.payload.role === "professor") {
    const facultyId = auth.payload.facultyId;
    if (!facultyId) {
      return NextResponse.json(
        { error: "Professor account must be linked to faculty" },
        { status: 403 }
      );
    }
    const result = await getFairnessForFaculty(facultyId);
    return NextResponse.json({ data: [result] });
  }

  let facultyIds: string[] = [];
  if (facultyIdParam) {
    if (auth.payload.role === "director") {
      const programIds = await getAccessibleProgramIds(auth.payload);
      if (programIds?.length) {
        const hasAccess = await prisma.facultyProgramAffiliation.findFirst({
          where: { facultyId: facultyIdParam, programId: { in: programIds } },
        });
        if (hasAccess) facultyIds = [facultyIdParam];
      }
    } else {
      facultyIds = [facultyIdParam];
    }
  } else if (programIdParam) {
    const affils = await prisma.facultyProgramAffiliation.findMany({
      where: { programId: programIdParam },
      select: { facultyId: true },
    });
    facultyIds = Array.from(new Set(affils.map((a) => a.facultyId)));
  } else {
    const programIds = await getAccessibleProgramIds(auth.payload);
    if (programIds === null) {
      const allFaculty = await prisma.faculty.findMany({
        select: { id: true },
      });
      facultyIds = allFaculty.map((f) => f.id);
    } else if (programIds.length > 0) {
      const affils = await prisma.facultyProgramAffiliation.findMany({
        where: { programId: { in: programIds } },
        select: { facultyId: true },
      });
      facultyIds = Array.from(new Set(affils.map((a) => a.facultyId)));
    }
  }

  if (auth.payload.role === "director" && facultyIds.length > 0) {
    const programIds = await getAccessibleProgramIds(auth.payload);
    if (programIds && programIds.length > 0) {
      const allowed = await prisma.facultyProgramAffiliation.findMany({
        where: { programId: { in: programIds } },
        select: { facultyId: true },
      });
      const allowedSet = new Set(allowed.map((a) => a.facultyId));
      facultyIds = facultyIds.filter((id) => allowedSet.has(id));
    } else {
      facultyIds = [];
    }
  }

  const data = await getFairnessForFacultyList(facultyIds);
  return NextResponse.json({ data });
}
