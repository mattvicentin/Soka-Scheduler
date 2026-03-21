/**
 * Fairness calculation based on instructional minutes.
 * Uses published historical_offerings data.
 * - busy_slot_percentage: % of busy window (e.g. 10–15) filled with teaching
 * - instructional_minutes: total teaching minutes across all historical offerings
 */
import { prisma } from "@/lib/db/client";
import { getConfigWithDefault } from "@/lib/config";
import { CONFIG_KEYS } from "@/lib/constants/config-keys";

const MINS_PER_HOUR = 60;
const DAYS_PER_WEEK = 5;

export interface FairnessResult {
  faculty_id: string;
  busy_slot_percentage: number;
  total_minutes: number;
  busy_minutes: number;
  /** Total instructional minutes from all historical offerings */
  instructional_minutes: number;
}

function overlapMinutes(
  slotStart: Date,
  slotEnd: Date,
  windowStartHour: number,
  windowEndHour: number
): number {
  const slotStartMins = slotStart.getHours() * MINS_PER_HOUR + slotStart.getMinutes();
  const slotEndMins = slotEnd.getHours() * MINS_PER_HOUR + slotEnd.getMinutes();
  const winStartMins = windowStartHour * MINS_PER_HOUR;
  const winEndMins = windowEndHour * MINS_PER_HOUR;
  const overlapStart = Math.max(slotStartMins, winStartMins);
  const overlapEnd = Math.min(slotEndMins, winEndMins);
  return Math.max(0, overlapEnd - overlapStart);
}

function slotMinutes(start: Date, end: Date): number {
  const s = start.getHours() * MINS_PER_HOUR + start.getMinutes();
  const e = end.getHours() * MINS_PER_HOUR + end.getMinutes();
  return Math.max(0, e - s);
}

export async function getFairnessForFaculty(
  facultyId: string
): Promise<FairnessResult> {
  const startHour = await getConfigWithDefault(CONFIG_KEYS.BUSY_SLOT_START_HOUR, 10);
  const endHour = await getConfigWithDefault(CONFIG_KEYS.BUSY_SLOT_END_HOUR, 15);
  const totalMinutes = DAYS_PER_WEEK * (endHour - startHour) * MINS_PER_HOUR;

  const historical = await prisma.historicalOffering.findMany({
    where: { facultyId },
    select: { startTime: true, endTime: true },
  });

  let busyMinutes = 0;
  let instructionalMinutes = 0;
  for (const h of historical) {
    busyMinutes += overlapMinutes(h.startTime, h.endTime, startHour, endHour);
    instructionalMinutes += slotMinutes(h.startTime, h.endTime);
  }

  const busySlotPercentage =
    totalMinutes > 0 ? (100 * busyMinutes) / totalMinutes : 0;

  return {
    faculty_id: facultyId,
    busy_slot_percentage: Math.round(busySlotPercentage * 10) / 10,
    total_minutes: totalMinutes,
    busy_minutes: busyMinutes,
    instructional_minutes: instructionalMinutes,
  };
}

export async function getFairnessForFacultyList(
  facultyIds: string[]
): Promise<FairnessResult[]> {
  if (facultyIds.length === 0) return [];
  const startHour = await getConfigWithDefault(CONFIG_KEYS.BUSY_SLOT_START_HOUR, 10);
  const endHour = await getConfigWithDefault(CONFIG_KEYS.BUSY_SLOT_END_HOUR, 15);
  const totalMinutes = DAYS_PER_WEEK * (endHour - startHour) * MINS_PER_HOUR;

  const historical = await prisma.historicalOffering.findMany({
    where: { facultyId: { in: facultyIds } },
    select: { facultyId: true, startTime: true, endTime: true },
  });

  const busyByFaculty: Record<string, number> = {};
  const instructionalByFaculty: Record<string, number> = {};
  for (const id of facultyIds) {
    busyByFaculty[id] = 0;
    instructionalByFaculty[id] = 0;
  }
  for (const h of historical) {
    busyByFaculty[h.facultyId] =
      (busyByFaculty[h.facultyId] ?? 0) +
      overlapMinutes(h.startTime, h.endTime, startHour, endHour);
    instructionalByFaculty[h.facultyId] =
      (instructionalByFaculty[h.facultyId] ?? 0) +
      slotMinutes(h.startTime, h.endTime);
  }

  return facultyIds.map((facultyId) => {
    const busyMinutes = busyByFaculty[facultyId] ?? 0;
    const instructionalMinutes = instructionalByFaculty[facultyId] ?? 0;
    const busySlotPercentage =
      totalMinutes > 0 ? (100 * busyMinutes) / totalMinutes : 0;
    return {
      faculty_id: facultyId,
      busy_slot_percentage: Math.round(busySlotPercentage * 10) / 10,
      total_minutes: totalMinutes,
      busy_minutes: busyMinutes,
      instructional_minutes: instructionalMinutes,
    };
  });
}
