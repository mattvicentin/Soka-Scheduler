import { z } from "zod";

const TYPICALLY_OFFERED = z.enum(["fall", "spring", "both"]);
const SEMESTER = z.enum(["fall", "spring"]);

export const createCourseTemplateSchema = z.object({
  title: z.string().min(1),
  course_code: z.string().min(1),
  credits: z.number().int().min(1).max(10).optional().nullable(),
  typically_offered: TYPICALLY_OFFERED.optional().nullable(),
  program_ids: z.array(z.string().uuid()).min(1),
});

export const updateCourseTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  course_code: z.string().min(1).optional(),
  credits: z.number().int().min(1).max(10).optional().nullable(),
  typically_offered: TYPICALLY_OFFERED.optional().nullable(),
});

export const createCourseOfferingSchema = z.object({
  course_template_id: z.string().uuid(),
  term_id: z.string().uuid(),
  section_code: z.string().min(1).max(10),
  crn: z.string().max(20).optional().nullable(),
  credits_override: z.number().int().min(1).max(10).optional().nullable(),
  participates_in_scheduling: z.boolean().optional(),
  instructor_faculty_id: z.string().uuid().optional(),
  instructor_load_share: z.number().min(0.01).max(1).optional(),
});

export const updateCourseOfferingSchema = z.object({
  section_code: z.string().min(1).max(10).optional(),
  crn: z.string().max(20).optional().nullable(),
  credits_override: z.number().int().min(1).max(10).optional().nullable(),
  participates_in_scheduling: z.boolean().optional(),
});

export const instructorSchema = z.object({
  faculty_id: z.string().uuid(),
  role: z.string().max(50).optional().nullable(),
  load_share: z.number().min(0.01).max(1),
  display_order: z.number().int().optional(),
});

export const updateInstructorSchema = z.object({
  role: z.string().max(50).optional().nullable(),
  load_share: z.number().min(0.01).max(1).optional(),
  display_order: z.number().int().optional(),
});

export const createTermSchema = z.object({
  name: z.string().min(1),
  semester: SEMESTER,
  academic_year: z.number().int(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const updateTermSchema = z.object({
  name: z.string().min(1).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
});

export const scheduleVersionSchema = z.object({
  term_id: z.string().uuid(),
  mode: z.enum(["draft", "official"]),
});
