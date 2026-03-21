/**
 * Time-block pressure (heatmap) calculation.
 * Counts concurrent slots per (day_of_week, time_block) from draft schedule.
 * Uses 1-hour blocks by default.
 */
import { prisma } from "@/lib/db/client";
import type { AuthScopePayload } from "@/lib/auth/scope";
import { getAccessibleProgramIds } from "@/lib/auth/scope";
import type { Prisma } from "@prisma/client";

/**
 * Time block: hour index (8 = 8:00, 9 = 9:00, etc.)
 */
export interface HeatmapCell {
  day_of_week: number;
  hour: number;
  slot_count: number;
  pressure: number; // 0-1 normalized, or raw count
}

export interface HeatmapResult {
  term_id: string;
  schedule_version_id: string;
  cells: HeatmapCell[];
  max_slot_count: number;
}

export async function getHeatmapData(
  termId: string,
  scheduleVersionId: string,
  programId?: string,
  payload?: AuthScopePayload,
  tx?: Prisma.TransactionClient
): Promise<HeatmapResult> {
  const client = tx ?? prisma;

  let programFilter: { some: { programId: string } | { programId: { in: string[] } } } | undefined;
  let instructorFilter: { some: { facultyId: string } } | undefined;

  if (payload?.role === "professor" && payload.facultyId) {
    instructorFilter = { some: { facultyId: payload.facultyId } };
  } else if (payload) {
    const programIds = await getAccessibleProgramIds(payload);
    if (programId && programIds !== null && !programIds.includes(programId)) {
      return { term_id: termId, schedule_version_id: scheduleVersionId, cells: [], max_slot_count: 0 };
    }
    if (programIds !== null && programIds.length > 0) {
      programFilter = programId
        ? { some: { programId } }
        : { some: { programId: { in: programIds } } };
    }
  } else if (programId) {
    programFilter = { some: { programId } };
  }

  const slots = await client.scheduleSlot.findMany({
    where: {
      scheduleVersionId,
      termId,
      courseOffering: {
        participatesInScheduling: true,
        ...(instructorFilter && { instructors: instructorFilter }),
        ...(programFilter && {
          courseTemplate: { programs: programFilter },
        }),
      },
    },
    select: { dayOfWeek: true, startTime: true, endTime: true },
  });

  const grid: Record<string, number> = {};
  for (let day = 1; day <= 5; day++) {
    for (let hour = 8; hour <= 17; hour++) {
      grid[`${day}-${hour}`] = 0;
    }
  }

  for (const slot of slots) {
    const startMins = slot.startTime.getHours() * 60 + slot.startTime.getMinutes();
    const endMins = slot.endTime.getHours() * 60 + slot.endTime.getMinutes();
    for (let hour = 8; hour <= 17; hour++) {
      const blockStart = hour * 60;
      const blockEnd = (hour + 1) * 60;
      if (startMins < blockEnd && endMins > blockStart) {
        const key = `${slot.dayOfWeek}-${hour}`;
        grid[key] = (grid[key] ?? 0) + 1;
      }
    }
  }

  const cells: HeatmapCell[] = [];
  let maxCount = 0;
  for (let day = 1; day <= 5; day++) {
    for (let hour = 8; hour <= 17; hour++) {
      const count = grid[`${day}-${hour}`] ?? 0;
      maxCount = Math.max(maxCount, count);
      cells.push({
        day_of_week: day,
        hour,
        slot_count: count,
        pressure: count,
      });
    }
  }

  const normalized = maxCount > 0
    ? cells.map((c) => ({
        ...c,
        pressure: Math.round((c.slot_count / maxCount) * 100) / 100,
      }))
    : cells;

  return {
    term_id: termId,
    schedule_version_id: scheduleVersionId,
    cells: normalized,
    max_slot_count: maxCount,
  };
}
