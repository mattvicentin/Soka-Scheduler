/**
 * Removes all faculty and course catalog data so you can re-import cleanly.
 * Keeps: programs, terms, schedule_versions (empty of slots), system_config, admin accounts.
 *
 * Run: npx tsx scripts/clear-faculty-and-courses.ts
 * Or:  npm run db:clear-faculty-courses
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // Proposals (cascades proposal_revision_log)
    await tx.scheduleProposal.deleteMany({});

    // Offerings → cascades schedule_slots, course_offering_instructors, historical_offerings
    await tx.courseOffering.deleteMany({});

    // Templates (break self-reference first)
    await tx.courseTemplateProgram.deleteMany({});
    await tx.courseTemplate.updateMany({ data: { sourceTemplateId: null } });
    await tx.courseTemplate.deleteMany({});

    await tx.invitation.deleteMany({});
    await tx.sabbatical.deleteMany({});
    await tx.facultyProgramAffiliation.deleteMany({});

    // Accounts tied to faculty (non-admin): clear audit rows first (FK restrict)
    const accountIds = (
      await tx.account.findMany({
        where: { facultyId: { not: null }, isAdmin: false },
        select: { id: true },
      })
    ).map((a) => a.id);
    if (accountIds.length > 0) {
      await tx.auditLog.deleteMany({ where: { actorAccountId: { in: accountIds } } });
    }
    await tx.account.deleteMany({
      where: { facultyId: { not: null }, isAdmin: false },
    });

    await tx.faculty.deleteMany({});
  });

  console.log("Cleared: course_offerings (+ slots, instructors, historical), course_templates (+ programs link),");
  console.log("  schedule_proposals, invitations, sabbaticals, faculty_program_affiliations,");
  console.log("  non-admin accounts linked to faculty, and all faculty rows.");
  console.log("Kept: programs, terms, schedule_versions, system_config, admin account(s).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
