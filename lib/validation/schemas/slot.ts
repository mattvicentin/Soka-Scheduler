import { z } from "zod";

const BUILDING_PREFERENCE = z.enum([
  "ikeda",
  "gandhi",
  "pauling",
  "curie",
  "maathai",
  "other",
]);

export const createSlotSchema = z.object({
  course_offering_id: z.string().uuid(),
  schedule_version_id: z.string().uuid(),
  day_of_week: z.number().int().min(1).max(5),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  building_preference: BUILDING_PREFERENCE.optional().nullable(),
  room_preference: z.string().max(100).optional().nullable(),
});

export const updateSlotSchema = z.object({
  day_of_week: z.number().int().min(1).max(5).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  building_preference: BUILDING_PREFERENCE.optional().nullable(),
  room_preference: z.string().max(100).optional().nullable(),
});
