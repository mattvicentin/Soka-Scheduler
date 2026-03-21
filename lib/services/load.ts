import { prisma } from "@/lib/db/client";
import { getConfigWithDefault } from "@/lib/config";
import { CONFIG_KEYS } from "@/lib/constants/config-keys";
import type { Prisma } from "@prisma/client";

/**
 * Get term IDs for the load period (academic_year or semester).
 */
export async function getTermIdsForLoadPeriod(
  termId: string,
  tx?: Prisma.TransactionClient
): Promise<string[]> {
  const client = tx ?? prisma;
  const term = await client.term.findUnique({ where: { id: termId } });
  if (!term) return [];

  const loadPeriod = await getConfigWithDefault(CONFIG_KEYS.LOAD_PERIOD, "academic_year");
  if (loadPeriod === "semester") {
    return [termId];
  }

  const terms = await client.term.findMany({
    where: { academicYear: term.academicYear },
    select: { id: true },
  });
  return terms.map((t) => t.id);
}

/**
 * Get current teaching load for a faculty in the given term(s).
 * Sums load_share from course_offering_instructors for offerings with participates_in_scheduling = true.
 */
export async function getCurrentLoad(
  facultyId: string,
  termIds: string[],
  tx?: Prisma.TransactionClient
): Promise<number> {
  if (termIds.length === 0) return 0;
  const client = tx ?? prisma;
  const result = await client.courseOfferingInstructor.aggregate({
    where: {
      facultyId,
      courseOffering: {
        termId: { in: termIds },
        participatesInScheduling: true,
      },
    },
    _sum: { loadShare: true },
  });
  return Number(result._sum.loadShare ?? 0);
}

/**
 * Get effective load capacity (expected load minus sabbatical reduction).
 */
export async function getEffectiveCapacity(
  facultyId: string,
  termIds: string[],
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;
  const faculty = await client.faculty.findUnique({
    where: { id: facultyId },
    select: { expectedAnnualLoad: true },
  });
  if (!faculty) return 0;

  const reduction = await client.sabbatical.aggregate({
    where: {
      facultyId,
      termId: { in: termIds },
    },
    _sum: { effectiveLoadReduction: true },
  });
  const reductionVal = Number(reduction._sum.effectiveLoadReduction ?? 0);
  return Math.max(0, faculty.expectedAnnualLoad - reductionVal);
}

/**
 * Validate that adding an instructor would not exceed load.
 */
export async function validateLoad(
  facultyId: string,
  termId: string,
  newLoadShare: number,
  excludeOfferingId?: string,
  tx?: Prisma.TransactionClient
): Promise<{ valid: boolean; message?: string }> {
  const client = tx ?? prisma;
  const faculty = await client.faculty.findUnique({
    where: { id: facultyId },
    select: { isExcluded: true },
  });
  if (!faculty) return { valid: false, message: "Faculty not found" };
  if (faculty.isExcluded) return { valid: false, message: "Faculty is excluded" };

  const termIds = await getTermIdsForLoadPeriod(termId, client);
  const currentLoad = await getCurrentLoad(facultyId, termIds, client);

  let adjustedLoad = currentLoad;
  if (excludeOfferingId) {
    const existing = await client.courseOfferingInstructor.aggregate({
      where: {
        facultyId,
        courseOfferingId: excludeOfferingId,
      },
      _sum: { loadShare: true },
    });
    adjustedLoad -= Number(existing._sum.loadShare ?? 0);
  }

  const capacity = await getEffectiveCapacity(facultyId, termIds, client);
  if (adjustedLoad + newLoadShare > capacity) {
    return {
      valid: false,
      message: `This would exceed the instructor's teaching capacity. Current load: ${adjustedLoad}, adding: ${newLoadShare}, capacity: ${capacity}. Adjust load share or choose another instructor.`,
    };
  }
  return { valid: true };
}

/** Near-capacity threshold (80%). */
const NEAR_CAPACITY_THRESHOLD = 0.8;

/**
 * Check if adding load would put faculty near or at capacity.
 * Returns an advisory message when utilization >= 80%.
 */
export async function getLoadUtilizationAdvisory(
  facultyId: string,
  termId: string,
  newLoadShare: number,
  excludeOfferingId?: string,
  tx?: Prisma.TransactionClient
): Promise<{ nearCapacity: boolean; message?: string }> {
  const client = tx ?? prisma;
  const termIds = await getTermIdsForLoadPeriod(termId, client);
  const currentLoad = await getCurrentLoad(facultyId, termIds, client);

  let adjustedLoad = currentLoad;
  if (excludeOfferingId) {
    const existing = await client.courseOfferingInstructor.aggregate({
      where: {
        facultyId,
        courseOfferingId: excludeOfferingId,
      },
      _sum: { loadShare: true },
    });
    adjustedLoad -= Number(existing._sum.loadShare ?? 0);
  }

  const capacity = await getEffectiveCapacity(facultyId, termIds, client);
  if (capacity <= 0) return { nearCapacity: false };

  const utilization = (adjustedLoad + newLoadShare) / capacity;
  if (utilization >= NEAR_CAPACITY_THRESHOLD) {
    const pct = Math.round(utilization * 100);
    return {
      nearCapacity: true,
      message: `This instructor would be at ${pct}% of their teaching capacity. Consider spreading assignments.`,
    };
  }
  return { nearCapacity: false };
}
