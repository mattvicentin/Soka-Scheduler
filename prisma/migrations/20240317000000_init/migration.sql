-- Soka Academic Scheduling System — Initial Migration
-- Final implementation specification. Run: npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('professor', 'director', 'dean');
CREATE TYPE "ProgramType" AS ENUM ('concentration', 'program', 'area');
CREATE TYPE "BuildingPreference" AS ENUM ('ikeda', 'gandhi', 'pauling', 'curie', 'maathai', 'other');
CREATE TYPE "SabbaticalType" AS ENUM ('sabbatical', 'admin_release', 'partial_reduction');
CREATE TYPE "TypicallyOffered" AS ENUM ('fall', 'spring', 'both');
CREATE TYPE "ScheduleVersionMode" AS ENUM ('draft', 'official');
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'submitted', 'under_review', 'revised', 'approved', 'finalized', 'published');
CREATE TYPE "VerificationCodePurpose" AS ENUM ('account_setup', 'sensitive_action');
CREATE TYPE "Semester" AS ENUM ('fall', 'spring');

-- CreateTable: faculty (no FK to accounts)
CREATE TABLE "faculty" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "expected_annual_load" INTEGER NOT NULL,
    "load_exception_reason" TEXT,
    "building_preference_default" "BuildingPreference",
    "room_preference_default" TEXT,
    "is_excluded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faculty_email_key" ON "faculty"("email");

-- CreateTable: accounts
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "faculty_id" UUID,
    "role" "AccountRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");
CREATE UNIQUE INDEX "accounts_faculty_id_key" ON "accounts"("faculty_id");

-- CreateTable: programs
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "director_account_id" UUID,
    "type" "ProgramType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: terms
CREATE TABLE "terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "semester" "Semester" NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terms_academic_year_semester_key" ON "terms"("academic_year", "semester");

-- CreateTable: system_config
CREATE TABLE "system_config" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable: course_templates
CREATE TABLE "course_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "course_code" VARCHAR(50) NOT NULL,
    "credits" INTEGER,
    "typically_offered" "TypicallyOffered",
    "source_template_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: course_template_programs
CREATE TABLE "course_template_programs" (
    "course_template_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_template_programs_pkey" PRIMARY KEY ("course_template_id","program_id")
);

CREATE INDEX "course_template_programs_program_id_idx" ON "course_template_programs"("program_id");

-- CreateTable: course_offerings
CREATE TABLE "course_offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_template_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "section_code" VARCHAR(10) NOT NULL,
    "crn" VARCHAR(20),
    "credits_override" INTEGER,
    "participates_in_scheduling" BOOLEAN NOT NULL DEFAULT true,
    "source_offering_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_offerings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_offerings_course_template_id_term_id_section_code_key" ON "course_offerings"("course_template_id", "term_id", "section_code");
CREATE INDEX "course_offerings_term_id_idx" ON "course_offerings"("term_id");
CREATE INDEX "course_offerings_course_template_id_term_id_idx" ON "course_offerings"("course_template_id", "term_id");
CREATE INDEX "course_offerings_participates_in_scheduling_idx" ON "course_offerings"("participates_in_scheduling");

-- CreateTable: course_offering_instructors
CREATE TABLE "course_offering_instructors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_offering_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "role" VARCHAR(50),
    "load_share" DECIMAL(3,2) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_offering_instructors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_offering_instructors_course_offering_id_faculty_id_key" ON "course_offering_instructors"("course_offering_id", "faculty_id");
CREATE INDEX "course_offering_instructors_faculty_id_idx" ON "course_offering_instructors"("faculty_id");
CREATE INDEX "course_offering_instructors_course_offering_id_idx" ON "course_offering_instructors"("course_offering_id");

-- CreateTable: schedule_versions
CREATE TABLE "schedule_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "term_id" UUID NOT NULL,
    "mode" "ScheduleVersionMode" NOT NULL,
    "version_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedule_versions_term_id_mode_key" ON "schedule_versions"("term_id", "mode");

-- CreateTable: schedule_slots
CREATE TABLE "schedule_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_offering_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "schedule_version_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "building_preference" "BuildingPreference",
    "room_preference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "schedule_slots_schedule_version_id_term_id_day_of_week_idx" ON "schedule_slots"("schedule_version_id", "term_id", "day_of_week");
CREATE INDEX "schedule_slots_course_offering_id_idx" ON "schedule_slots"("course_offering_id");

-- CreateTable: schedule_proposals
CREATE TABLE "schedule_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(3),
    "approved_by_account_id" UUID,
    "finalized_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedule_proposals_faculty_id_term_id_key" ON "schedule_proposals"("faculty_id", "term_id");
CREATE INDEX "schedule_proposals_term_id_status_idx" ON "schedule_proposals"("term_id", "status");

-- CreateTable: proposal_revision_log
CREATE TABLE "proposal_revision_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_proposal_id" UUID NOT NULL,
    "edited_by_account_id" UUID NOT NULL,
    "edited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes_summary" JSONB,

    CONSTRAINT "proposal_revision_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sabbaticals
CREATE TABLE "sabbaticals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "type" "SabbaticalType" NOT NULL,
    "reason" TEXT,
    "effective_load_reduction" DECIMAL(3,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sabbaticals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sabbaticals_faculty_id_term_id_idx" ON "sabbaticals"("faculty_id", "term_id");

-- CreateTable: historical_offerings
CREATE TABLE "historical_offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_offerings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "historical_offerings_faculty_id_idx" ON "historical_offerings"("faculty_id");

-- CreateTable: invitations
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_faculty_id_expires_at_idx" ON "invitations"("faculty_id", "expires_at");

-- CreateTable: verification_codes
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "purpose" "VerificationCodePurpose" NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: refresh_tokens
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_log
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "actor_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable: account_program_associations
CREATE TABLE "account_program_associations" (
    "account_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_program_associations_pkey" PRIMARY KEY ("account_id","program_id")
);

CREATE INDEX "account_program_associations_program_id_idx" ON "account_program_associations"("program_id");

-- CreateTable: faculty_program_affiliations
CREATE TABLE "faculty_program_affiliations" (
    "faculty_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faculty_program_affiliations_pkey" PRIMARY KEY ("faculty_id","program_id")
);

CREATE INDEX "faculty_program_affiliations_program_id_idx" ON "faculty_program_affiliations"("program_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_director_account_id_fkey" FOREIGN KEY ("director_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_templates" ADD CONSTRAINT "course_templates_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "course_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_template_programs" ADD CONSTRAINT "course_template_programs_course_template_id_fkey" FOREIGN KEY ("course_template_id") REFERENCES "course_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_template_programs" ADD CONSTRAINT "course_template_programs_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_template_id_fkey" FOREIGN KEY ("course_template_id") REFERENCES "course_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_source_offering_id_fkey" FOREIGN KEY ("source_offering_id") REFERENCES "course_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offering_instructors" ADD CONSTRAINT "course_offering_instructors_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offering_instructors" ADD CONSTRAINT "course_offering_instructors_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_schedule_version_id_fkey" FOREIGN KEY ("schedule_version_id") REFERENCES "schedule_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_proposals" ADD CONSTRAINT "schedule_proposals_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_proposals" ADD CONSTRAINT "schedule_proposals_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_proposals" ADD CONSTRAINT "schedule_proposals_approved_by_account_id_fkey" FOREIGN KEY ("approved_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_proposals" ADD CONSTRAINT "schedule_proposals_finalized_by_account_id_fkey" FOREIGN KEY ("finalized_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_revision_log" ADD CONSTRAINT "proposal_revision_log_schedule_proposal_id_fkey" FOREIGN KEY ("schedule_proposal_id") REFERENCES "schedule_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_revision_log" ADD CONSTRAINT "proposal_revision_log_edited_by_account_id_fkey" FOREIGN KEY ("edited_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sabbaticals" ADD CONSTRAINT "sabbaticals_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sabbaticals" ADD CONSTRAINT "sabbaticals_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_offerings" ADD CONSTRAINT "historical_offerings_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_offerings" ADD CONSTRAINT "historical_offerings_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_offerings" ADD CONSTRAINT "historical_offerings_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_program_associations" ADD CONSTRAINT "account_program_associations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_program_associations" ADD CONSTRAINT "account_program_associations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_program_affiliations" ADD CONSTRAINT "faculty_program_affiliations_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_program_affiliations" ADD CONSTRAINT "faculty_program_affiliations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
