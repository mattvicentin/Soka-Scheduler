import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Validate that load_share values sum to 1.0 for an offering with participates_in_scheduling = true.
 * For offerings with participates_in_scheduling = false, instructors are optional.
 */
export async function validateLoadShareSum(
  offeringId: string,
  proposedInstructors: Array<{ facultyId: string; loadShare: number }>,
  tx?: Prisma.TransactionClient
): Promise<{ valid: boolean; message?: string }> {
  const client = tx ?? prisma;
  const offering = await client.courseOffering.findUnique({
    where: { id: offeringId },
    select: { participatesInScheduling: true },
  });
  if (!offering) return { valid: false, message: "Offering not found" };

  if (!offering.participatesInScheduling) {
    return { valid: true };
  }

  const sum = proposedInstructors.reduce((acc, i) => acc + i.loadShare, 0);
  if (Math.abs(sum - 1) > 0.001) {
    return {
      valid: false,
      message: `Instructor load shares must add up to 1.0 (currently ${sum.toFixed(2)}). Adjust the load shares.`,
    };
  }

  for (const i of proposedInstructors) {
    if (i.loadShare <= 0 || i.loadShare > 1) {
      return { valid: false, message: "Each instructor's load share must be between 0 and 1." };
    }
  }

  return { valid: true };
}

/**
 * Get current instructors for an offering and compute the new sum when adding/updating/removing one.
 */
export async function getProposedInstructorsForValidation(
  offeringId: string,
  change: { type: "add" | "update" | "remove"; facultyId: string; loadShare?: number },
  tx?: Prisma.TransactionClient
): Promise<Array<{ facultyId: string; loadShare: number }>> {
  const client = tx ?? prisma;
  const existing = await client.courseOfferingInstructor.findMany({
    where: { courseOfferingId: offeringId },
    select: { facultyId: true, loadShare: true },
  });

  const current = existing.map((e) => ({
    facultyId: e.facultyId,
    loadShare: Number(e.loadShare),
  }));

  if (change.type === "add" && change.loadShare !== undefined) {
    return [...current, { facultyId: change.facultyId, loadShare: change.loadShare }];
  }
  if (change.type === "update" && change.loadShare !== undefined) {
    return current.map((c) =>
      c.facultyId === change.facultyId ? { ...c, loadShare: change.loadShare! } : c
    );
  }
  if (change.type === "remove") {
    return current.filter((c) => c.facultyId !== change.facultyId);
  }

  return current;
}
