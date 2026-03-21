import { z } from "zod";

const BUILDING_PREFERENCE = z.enum(["ikeda", "gandhi", "pauling", "curie", "maathai", "other"]);

export const createFacultySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  expected_annual_load: z.number().int().min(1).max(7),
  load_exception_reason: z.string().optional(),
  building_preference_default: BUILDING_PREFERENCE.optional(),
  room_preference_default: z.string().optional(),
  program_ids: z.array(z.string().uuid()).min(1),
  course_offering_ids: z.array(z.string().uuid()).optional(),
});

export const updateFacultySchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  expected_annual_load: z.number().int().min(1).max(7).optional(),
  load_exception_reason: z.string().optional().nullable(),
  building_preference_default: BUILDING_PREFERENCE.optional().nullable(),
  room_preference_default: z.string().optional().nullable(),
  is_excluded: z.boolean().optional(),
});

export const facultyAffiliationSchema = z.object({
  program_id: z.string().uuid(),
  is_primary: z.boolean().optional(),
});
