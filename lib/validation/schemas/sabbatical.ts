import { z } from "zod";

const SABBATICAL_TYPE = z.enum(["sabbatical", "admin_release", "partial_reduction"]);

export const createSabbaticalSchema = z.object({
  faculty_id: z.string().uuid(),
  term_id: z.string().uuid(),
  type: SABBATICAL_TYPE,
  reason: z.string().optional().nullable(),
  effective_load_reduction: z.number().min(0.01).max(7),
});

export const updateSabbaticalSchema = z.object({
  type: SABBATICAL_TYPE.optional(),
  reason: z.string().optional().nullable(),
  effective_load_reduction: z.number().min(0.01).max(7).optional(),
});
