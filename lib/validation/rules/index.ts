/**
 * Validation rules orchestrator.
 * Centralizes validation - delegates to slot-validation, load, instructor-validation.
 */
import type { ValidationResult, ValidationError } from "../types";
import { validateSlotPlacement } from "@/lib/services/slot-validation";
import { validateLoad } from "@/lib/services/load";
import {
  validateLoadShareSum,
  getProposedInstructorsForValidation,
} from "@/lib/services/instructor-validation";
import type { Prisma } from "@prisma/client";

export type SlotValidationContext = {
  scheduleVersionId: string;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  excludeSlotId?: string;
  courseOfferingId?: string;
  viewerFacultyId?: string | null;
  tx?: Prisma.TransactionClient;
};

export type InstructorValidationContext = {
  offeringId: string;
  change: { type: "add" | "update" | "remove"; facultyId: string; loadShare?: number };
  tx?: Prisma.TransactionClient;
};

/**
 * Validate slot placement (conflict, duration, start minute).
 * Use this when creating or updating schedule slots.
 */
export async function validateSlotPlacementRule(
  ctx: SlotValidationContext
): Promise<ValidationResult> {
  return validateSlotPlacement(
    ctx.scheduleVersionId,
    ctx.dayOfWeek,
    ctx.startTime,
    ctx.endTime,
    ctx.excludeSlotId,
    ctx.courseOfferingId,
    ctx.viewerFacultyId,
    ctx.tx
  );
}

/**
 * Validate instructor load share sum for participates_in_scheduling offerings.
 */
export async function validateInstructorLoadShareRule(
  ctx: InstructorValidationContext
): Promise<ValidationResult> {
  const proposed = await getProposedInstructorsForValidation(
    ctx.offeringId,
    ctx.change,
    ctx.tx
  );
  const result = await validateLoadShareSum(ctx.offeringId, proposed, ctx.tx);
  if (result.valid) {
    return { valid: true, errors: [], warnings: [] };
  }
  return {
    valid: false,
    errors: [{ code: "LOAD_SHARE_SUM", message: result.message ?? "Invalid load share" }],
    warnings: [],
  };
}

/**
 * Validate faculty load (annual load, not just term).
 */
export async function validateFacultyLoadRule(
  facultyId: string,
  termId: string,
  newLoadShare: number,
  excludeOfferingId?: string,
  tx?: Prisma.TransactionClient
): Promise<ValidationResult> {
  const result = await validateLoad(
    facultyId,
    termId,
    newLoadShare,
    excludeOfferingId,
    tx
  );
  if (result.valid) {
    return { valid: true, errors: [], warnings: [] };
  }
  return {
    valid: false,
    errors: [{ code: "ANNUAL_LOAD", message: result.message ?? "Load exceeded" }],
    warnings: [],
  };
}
