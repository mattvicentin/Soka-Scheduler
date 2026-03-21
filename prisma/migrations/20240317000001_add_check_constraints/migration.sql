-- CHECK constraints not supported by Prisma schema; added via raw SQL.
-- Enforces: faculty load 1-7, credits range, load_share, day_of_week, etc.

-- accounts: (is_admin = false) OR (faculty_id IS NULL)
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_admin_no_faculty_check" 
  CHECK (NOT "is_admin" OR "faculty_id" IS NULL);

-- faculty: expected_annual_load BETWEEN 1 AND 7
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_expected_load_check" 
  CHECK ("expected_annual_load" >= 1 AND "expected_annual_load" <= 7);

-- course_templates: credits 1-10 when set
ALTER TABLE "course_templates" ADD CONSTRAINT "course_templates_credits_check" 
  CHECK ("credits" IS NULL OR ("credits" >= 1 AND "credits" <= 10));

-- course_offerings: credits_override 1-10 when set
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_credits_override_check" 
  CHECK ("credits_override" IS NULL OR ("credits_override" >= 1 AND "credits_override" <= 10));

-- course_offering_instructors: load_share > 0 AND <= 1
ALTER TABLE "course_offering_instructors" ADD CONSTRAINT "course_offering_instructors_load_share_check" 
  CHECK ("load_share" > 0 AND "load_share" <= 1);

-- schedule_slots: day_of_week 1-5
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_day_of_week_check" 
  CHECK ("day_of_week" >= 1 AND "day_of_week" <= 5);

-- schedule_slots: end_time > start_time
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_time_range_check" 
  CHECK ("end_time" > "start_time");

-- sabbaticals: effective_load_reduction 0-1
ALTER TABLE "sabbaticals" ADD CONSTRAINT "sabbaticals_load_reduction_check" 
  CHECK ("effective_load_reduction" > 0 AND "effective_load_reduction" <= 1);

-- historical_offerings: day_of_week 1-5
ALTER TABLE "historical_offerings" ADD CONSTRAINT "historical_offerings_day_of_week_check" 
  CHECK ("day_of_week" >= 1 AND "day_of_week" <= 5);
