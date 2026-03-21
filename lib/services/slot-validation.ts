/**
 * Slot placement validation: conflict, duration, start minute.
 * Centralized validation engine — hard constraints block; crowded-slot warn vs block is a Dean setting.
 */
import { prisma } from "@/lib/db/client";
import {
  getAllowedStartMinutes,
  getMaxClassDurationMinutes,
  getCrowdedSlotThreshold,
  getCrowdedPeriodPolicy,
} from "@/lib/config";
import type { Prisma } from "@prisma/client";
import type { ValidationResult, ValidationError } from "@/lib/validation/types";

/**
 * Check if two time ranges overlap (same day).
 */
function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  const aS = aStart.getHours() * 60 + aStart.getMinutes();
  const aE = aEnd.getHours() * 60 + aEnd.getMinutes();
  const bS = bStart.getHours() * 60 + bStart.getMinutes();
  const bE = bEnd.getHours() * 60 + bEnd.getMinutes();
  return aS < bE && bS < aE;
}

function toMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Validate slot placement. Returns errors (block) and warnings (advisory).
 * - Same-instructor overlapping slots: always a hard error (not configurable)
 * - Too many classes in the same time period ("crowded slot"): warning or hard error per Dean setting (crowded_period_policy)
 * - Class duration rule: hard error
 * - Allowed start minutes: hard error
 * - participates_in_scheduling: only offerings with true are scheduled; instructors from offering used for conflict check
 */
export async function validateSlotPlacement(
  scheduleVersionId: string,
  dayOfWeek: number,
  startTime: Date,
  endTime: Date,
  excludeSlotId?: string,
  courseOfferingId?: string,
  /** When set and conflict is only this faculty, message uses "You..." (professor UX). */
  viewerFacultyId?: string | null,
  tx?: Prisma.TransactionClient
): Promise<ValidationResult> {
  const client = tx ?? prisma;
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const [maxDuration, allowedMinutesRaw, crowdedPeriodPolicy] = await Promise.all([
    getMaxClassDurationMinutes(),
    getAllowedStartMinutes(),
    getCrowdedPeriodPolicy(),
  ]);
  const allowedMinutes = Array.isArray(allowedMinutesRaw)
    ? allowedMinutesRaw.map((m) => (typeof m === "number" ? m : parseInt(String(m), 10)))
    : [0, 15, 30, 45];

  const durationMins = toMinutes(endTime) - toMinutes(startTime);
  if (durationMins <= 0) {
    errors.push({ code: "CLASS_DURATION", message: "Class end time must be after the start time." });
  } else if (durationMins > maxDuration) {
    const hours = Math.floor(maxDuration / 60);
    const mins = maxDuration % 60;
    const durationStr = hours > 0 ? `${hours} hour${hours > 1 ? "s" : ""}${mins > 0 ? ` ${mins} minutes` : ""}` : `${maxDuration} minutes`;
    errors.push({
      code: "CLASS_DURATION",
      message: `Class length cannot exceed ${durationStr}. Please shorten the time block.`,
    });
  }

  const startMinute = startTime.getMinutes();
  if (!allowedMinutes.includes(startMinute)) {
    const examples = Array.from(new Set(allowedMinutes))
      .sort((a, b) => a - b)
      .map((m) => `:${String(m).padStart(2, "0")}`)
      .join(", ");
    errors.push({
      code: "START_MINUTE",
      message: `Class must start on the hour or at ${examples} (e.g., 9:00, 9:15, 9:30).`,
    });
  }

  const facultyIds: string[] = [];
  if (courseOfferingId) {
    const offering = await client.courseOffering.findUnique({
      where: { id: courseOfferingId },
      select: { participatesInScheduling: true },
    });
    if (offering?.participatesInScheduling) {
      const instructors = await client.courseOfferingInstructor.findMany({
        where: { courseOfferingId },
        select: { facultyId: true },
      });
      facultyIds.push(...instructors.map((i) => i.facultyId));
    }
  }

  const slots = await client.scheduleSlot.findMany({
    where: {
      scheduleVersionId,
      dayOfWeek,
      ...(excludeSlotId && { id: { not: excludeSlotId } }),
    },
    include: {
      courseOffering: {
        include: {
          instructors: { select: { facultyId: true } },
        },
      },
    },
  });

  let overlappingCount = 0;
  const conflictFacultySet = new Set<string>();
  let conflictTimeRange: { t1: string; t2: string } | null = null;
  for (const slot of slots) {
    if (!slot.courseOffering.participatesInScheduling) continue;
    const overlapsSlot = overlaps(
      slot.startTime,
      slot.endTime,
      startTime,
      endTime
    );
    if (overlapsSlot) overlappingCount++;
    const slotFacultyIds = slot.courseOffering.instructors.map((i) => i.facultyId);
    const conflictFaculty = facultyIds.filter((f) => slotFacultyIds.includes(f));
    conflictFaculty.forEach((f) => conflictFacultySet.add(f));
    if (conflictFaculty.length > 0 && overlapsSlot && !conflictTimeRange) {
      conflictTimeRange = {
        t1: slot.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false }),
        t2: slot.endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false }),
      };
    }
  }
  if (conflictFacultySet.size > 0 && conflictTimeRange) {
    const { t1, t2 } = conflictTimeRange;
    const onlyViewerConflict =
      viewerFacultyId &&
      conflictFacultySet.size === 1 &&
      conflictFacultySet.has(viewerFacultyId);
    const message = onlyViewerConflict
      ? `You are already scheduled to teach another class at ${t1}–${t2}. Choose a different time.`
      : conflictFacultySet.size === 1
        ? `An instructor for this course is already scheduled for another class at ${t1}–${t2}. Choose a different time.`
        : `Multiple instructors for this course overlap with another class at ${t1}–${t2}. Choose a different time.`;
    errors.push({ code: "FACULTY_CONFLICT", message });
  }

  const crowdedThreshold = await getCrowdedSlotThreshold();
  if (overlappingCount >= crowdedThreshold) {
    const crowdedMessage = `This time slot already has ${overlappingCount} classes. Consider spreading classes to reduce room conflicts.`;
    if (crowdedPeriodPolicy === "block") {
      errors.push({ code: "CROWDED_SLOT", message: crowdedMessage });
    } else {
      warnings.push({ code: "CROWDED_SLOT", message: crowdedMessage });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
