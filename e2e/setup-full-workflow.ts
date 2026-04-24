/**
 * Seeds (or refreshes) DB state for e2e/full-workflow.spec.ts.
 * Run before Playwright:  npx tsx e2e/setup-full-workflow.ts
 * Requires: DATABASE_URL, at least one term, and at least one program with 3+ course templates
 *   whose program links are all non-exempt (see programExempt). Optional: E2E_WF_PROGRAM_ID to
 *   force which program to use for director + faculty + offerings.
 * Writes e2e/.workflow.json (term id for the Playwright spec) — add to .gitignore locally if needed.
 *
 * Default E2E accounts (override with E2E_WF_PROF_*, E2E_WF_DIR_*, E2E_WF_DEAN_*):
 *   Professor  e2e-wf-prof@local.test  /  E2E_WF_Password_prof_1!
 *   Director   e2e-wf-dir@local.test   /  E2E_WF_Password_dir_1!
 *   Dean       e2e-wf-dean@local.test  /  E2E_WF_Password_dean_1!
 */
import { writeFileSync } from "fs";
import { join } from "path";
import type { Program } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

const PROF_EMAIL = process.env.E2E_WF_PROF_EMAIL ?? "e2e-wf-prof@local.test";
const DIR_EMAIL = process.env.E2E_WF_DIR_EMAIL ?? "e2e-wf-dir@local.test";
const DEAN_EMAIL = process.env.E2E_WF_DEAN_EMAIL ?? "e2e-wf-dean@local.test";
const PROF_PASSWORD = process.env.E2E_WF_PROF_PASSWORD ?? "E2E_WF_Password_prof_1!";
const DIR_PASSWORD = process.env.E2E_WF_DIR_PASSWORD ?? "E2E_WF_Password_dir_1!";
const DEAN_PASSWORD = process.env.E2E_WF_DEAN_PASSWORD ?? "E2E_WF_Password_dean_1!";

const SECTIONS = ["E2E-WF-1", "E2E-WF-2", "E2E-WF-3"] as const;

const EXEMPT_FRAGS = ["creative arts", "distinguished topics", "career building"];

function programExempt(name: string): boolean {
  const n = name.toLowerCase();
  return EXEMPT_FRAGS.some((f) => n.includes(f));
}

/** Templates linked to this program where no linked program is "exempt" (matches calendar isExemptFromTimePresets). */
async function listWorkflowEligibleTemplates(programId: string) {
  const templates = await prisma.courseTemplate.findMany({
    where: { programs: { some: { programId } } },
    include: { programs: { include: { program: true } } },
  });
  return templates.filter(
    (t) => t.programs.length > 0 && t.programs.every((p) => !programExempt(p.program.name))
  );
}

/** Remove rows that block Account deletes (onDelete: Restrict in schema). */
async function clearAccountDeleteBlockers(accountIds: string[]) {
  if (accountIds.length === 0) return;
  await prisma.auditLog.deleteMany({ where: { actorAccountId: { in: accountIds } } });
  await prisma.invitation.deleteMany({ where: { createdByAccountId: { in: accountIds } } });
  await prisma.proposalRevisionLog.deleteMany({ where: { editedByAccountId: { in: accountIds } } });
}

async function main() {
  const term = await prisma.term.findFirst({
    orderBy: [{ academicYear: "desc" }, { semester: "desc" }],
  });
  if (!term) {
    console.error("No term in database. Seed terms first (npm run db:seed).");
    process.exit(1);
  }

  // Remove previous E2E data (same section codes / emails)
  const oldOfferings = await prisma.courseOffering.findMany({
    where: { sectionCode: { in: [...SECTIONS] } },
    select: { id: true },
  });
  const oids = oldOfferings.map((o) => o.id);
  if (oids.length) {
    await prisma.scheduleSlot.deleteMany({ where: { courseOfferingId: { in: oids } } });
    await prisma.courseOfferingInstructor.deleteMany({ where: { courseOfferingId: { in: oids } } });
    await prisma.courseOffering.deleteMany({ where: { id: { in: oids } } });
  }

  const oldFaculty = await prisma.faculty.findMany({
    where: { email: { in: [PROF_EMAIL, DIR_EMAIL] } },
    select: { id: true, email: true },
  });
  for (const f of oldFaculty) {
    await prisma.scheduleProposal.deleteMany({ where: { facultyId: f.id } });
  }
  const e2eAccounts = await prisma.account.findMany({
    where: { email: { in: [PROF_EMAIL, DIR_EMAIL] } },
    select: { id: true },
  });
  await clearAccountDeleteBlockers(e2eAccounts.map((a) => a.id));
  await prisma.account.deleteMany({ where: { email: { in: [PROF_EMAIL, DIR_EMAIL] } } });
  await prisma.faculty.deleteMany({ where: { email: { in: [PROF_EMAIL, DIR_EMAIL] } } });

  const forcedProgramId = process.env.E2E_WF_PROGRAM_ID?.trim() || null;
  let program: Program | null = null;
  let picked: Awaited<ReturnType<typeof listWorkflowEligibleTemplates>> = [];

  if (forcedProgramId) {
    const p = await prisma.program.findUnique({ where: { id: forcedProgramId } });
    if (!p) {
      console.error(`E2E_WF_PROGRAM_ID=${forcedProgramId} not found.`);
      process.exit(1);
    }
    const t = await listWorkflowEligibleTemplates(p.id);
    if (t.length < 3) {
      console.error(
        `Program "${p.name}" has only ${t.length} workflow-eligible course template(s) (non-exempt program links). Pick another E2E_WF_PROGRAM_ID or add templates.`
      );
      process.exit(1);
    }
    program = p;
    picked = t.slice(0, 3);
  } else {
    const programs = await prisma.program.findMany({ orderBy: { name: "asc" } });
    if (programs.length === 0) {
      console.error("No program in database. Run db:seed.");
      process.exit(1);
    }
    for (const p of programs) {
      const t = await listWorkflowEligibleTemplates(p.id);
      if (t.length >= 3) {
        program = p;
        picked = t.slice(0, 3);
        break;
      }
    }
    if (!program || picked.length < 3) {
      console.error(
        "No program has 3+ course templates whose program links are all non-exempt (not only Creative Arts / Distinguished Topics / Career Building). " +
          "Set E2E_WF_PROGRAM_ID to a program with enough cross-listed templates, or adjust catalog/seed data."
      );
      process.exit(1);
    }
  }

  // Dean: upsert only (avoids delete failures on FKs from audit/invites/revision logs)
  const phDean = await hashPassword(DEAN_PASSWORD);
  await prisma.account.upsert({
    where: { email: DEAN_EMAIL },
    create: {
      email: DEAN_EMAIL,
      role: "dean",
      passwordHash: phDean,
      isAdmin: false,
      deanTourCompletedAt: new Date(),
    },
    update: {
      passwordHash: phDean,
      role: "dean",
      isActive: true,
      isAdmin: false,
      facultyId: null,
      deanTourCompletedAt: new Date(),
    },
  });

  const phProf = await hashPassword(PROF_PASSWORD);
  const phDir = await hashPassword(DIR_PASSWORD);

  const dirAccount = await prisma.account.create({
    data: {
      email: DIR_EMAIL,
      role: "director",
      passwordHash: phDir,
      isAdmin: false,
      // Skip welcome / Shepherd gating in dashboard shell (see DashboardShell welcomeModalOpen)
      directorTourCompletedAt: new Date(),
    },
  });

  const profFaculty = await prisma.faculty.create({
    data: {
      email: PROF_EMAIL,
      name: "E2E Workflow Professor",
      expectedAnnualLoad: 7,
    },
  });

  await prisma.facultyProgramAffiliation.create({
    data: { facultyId: profFaculty.id, programId: program.id, isPrimary: true },
  });

  await prisma.account.create({
    data: {
      email: PROF_EMAIL,
      role: "professor",
      passwordHash: phProf,
      facultyId: profFaculty.id,
      professorTourCompletedAt: new Date(),
    },
  });

  await prisma.program.update({
    where: { id: program.id },
    data: { directorAccountId: dirAccount.id },
  });

  await prisma.scheduleVersion.upsert({
    where: { termId_mode: { termId: term.id, mode: "draft" } },
    create: { termId: term.id, mode: "draft", versionNumber: 1 },
    update: {},
  });

  for (let i = 0; i < 3; i++) {
    const t = picked[i]!;
    const crn = `E2EWF${Date.now().toString().slice(-6)}${i}`;
    const offering = await prisma.courseOffering.create({
      data: {
        courseTemplateId: t.id,
        termId: term.id,
        sectionCode: SECTIONS[i]!,
        crn,
        participatesInScheduling: true,
      },
    });
    await prisma.courseOfferingInstructor.create({
      data: {
        courseOfferingId: offering.id,
        facultyId: profFaculty.id,
        loadShare: 1,
        displayOrder: 0,
      },
    });
  }

  console.log("E2E workflow data ready.");
  console.log(`  Term: ${term.name} (${term.id})`);
  console.log(`  Program: ${program.name} (director: ${dirAccount.id})`);
  console.log("  Playwright env (defaults in spec match these; override if needed):");
  console.log(`  E2E_WF_PROF_EMAIL=${PROF_EMAIL}`);
  console.log(`  E2E_WF_PROF_PASSWORD=${PROF_PASSWORD}`);
  console.log(`  E2E_WF_DIR_EMAIL=${DIR_EMAIL}`);
  console.log(`  E2E_WF_DIR_PASSWORD=${DIR_PASSWORD}`);
  console.log(`  E2E_WF_DEAN_EMAIL=${DEAN_EMAIL}`);
  console.log(`  E2E_WF_DEAN_PASSWORD=${DEAN_PASSWORD}`);

  const wfPath = join(__dirname, ".workflow.json");
  writeFileSync(
    wfPath,
    JSON.stringify(
      { termId: term.id, termName: term.name, profName: "E2E Workflow Professor" },
      null,
      2
    )
  );
  console.log(`  Wrote ${wfPath} (used by e2e/full-workflow.spec.ts for term scoping).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
