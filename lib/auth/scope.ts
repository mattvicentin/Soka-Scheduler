import type { AccountRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/** JWT fields sufficient for program / faculty scope checks (call sites need not pass exp/iat/email). */
export type AuthScopePayload = {
  accountId: string;
  role: AccountRole;
  isAdmin: boolean;
  /** Omitted when unknown; treated like null for professor scope. */
  facultyId?: string | null;
};

/**
 * Get program IDs the current user can access.
 * Dean/admin: all programs. Director: account_program_associations. Professor: faculty_program_affiliations.
 */
export async function getAccessibleProgramIds(payload: AuthScopePayload): Promise<string[] | null> {
  if (payload.isAdmin || payload.role === "dean") {
    return null;
  }
  if (payload.role === "director") {
    const assocs = await prisma.accountProgramAssociation.findMany({
      where: { accountId: payload.accountId },
      select: { programId: true },
    });
    const directedPrograms = await prisma.program.findMany({
      where: { directorAccountId: payload.accountId },
      select: { id: true },
    });
    return Array.from(
      new Set([
        ...assocs.map((a) => a.programId),
        ...directedPrograms.map((p) => p.id),
      ])
    );
  }
  if (payload.role === "professor" && payload.facultyId) {
    const affils = await prisma.facultyProgramAffiliation.findMany({
      where: { facultyId: payload.facultyId },
      select: { programId: true },
    });
    return affils.map((a) => a.programId);
  }
  return [];
}

/**
 * Check if user has access to a program. Dean/admin: always. Director/professor: must be in program list.
 */
export async function canAccessProgram(payload: AuthScopePayload, programId: string): Promise<boolean> {
  const ids = await getAccessibleProgramIds(payload);
  if (ids === null) return true;
  return ids.includes(programId);
}

/**
 * Check if user has access to a faculty (by program scope).
 * Dean/admin: always. Director: faculty must be in one of director's programs.
 */
export async function canAccessFaculty(payload: AuthScopePayload, facultyId: string): Promise<boolean> {
  if (payload.isAdmin || payload.role === "dean") return true;
  if (payload.role === "professor" && payload.facultyId === facultyId) return true;
  const programIds = await getAccessibleProgramIds(payload);
  if (!programIds || programIds.length === 0) return false;
  const hasAffil = await prisma.facultyProgramAffiliation.findFirst({
    where: { facultyId, programId: { in: programIds } },
  });
  return !!hasAffil;
}

/**
 * Check if user has access to a course template (by program scope via course_template_programs).
 */
export async function canAccessCourseTemplate(
  payload: AuthScopePayload,
  templateId: string
): Promise<boolean> {
  if (payload.isAdmin || payload.role === "dean") return true;
  const programIds = await getAccessibleProgramIds(payload);
  if (!programIds || programIds.length === 0) return false;
  const hasProgram = await prisma.courseTemplateProgram.findFirst({
    where: { courseTemplateId: templateId, programId: { in: programIds } },
  });
  return !!hasProgram;
}

/**
 * Check if user has access to a course offering (via template's programs).
 */
export async function canAccessCourseOffering(
  payload: AuthScopePayload,
  offeringId: string
): Promise<boolean> {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: { courseTemplateId: true },
  });
  if (!offering) return false;
  return canAccessCourseTemplate(payload, offering.courseTemplateId);
}
