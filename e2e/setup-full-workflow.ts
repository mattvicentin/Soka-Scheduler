/**
 * Seeds (or refreshes) DB state for e2e/full-workflow.spec.ts.
 * Run before Playwright:  npx tsx e2e/setup-full-workflow.ts
 * Requires: DATABASE_URL, at least one term, one program, 3+ course templates in that program
 *   that are not "Creative Arts", "Distinguished Topics", or "Career Building" only.
 * Writes e2e/.workflow.json (term id for the Playwright spec) — add to .gitignore locally if needed.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

const PROF_EMAIL = process.env.E2E_WF_PROF_EMAIL ?? "e2e-wf-prof@local.test";
const DIR_EMAIL = process.env.E2E_WF_DIR_EMAIL ?? "e2e-wf-dir@local.test";
const PROF_PASSWORD = process.env.E2E_WF_PROF_PASSWORD ?? "E2E_WF_Password_prof_1!";
const DIR_PASSWORD = process.env.E2E_WF_DIR_PASSWORD ?? "E2E_WF_Password_dir_1!";

const SECTIONS = ["E2E-WF-1", "E2E-WF-2", "E2E-WF-3"] as const;

const EXEMPT_FRAGS = ["creative arts", "distinguished topics", "career building"];

function programExempt(name: string): boolean {
  const n = name.toLowerCase();
  return EXEMPT_FRAGS.some((f) => n.includes(f));
}

async function main() {
  const term = await prisma.term.findFirst({
    orderBy: [{ academicYear: "desc" }, { semester: "desc" }],
  });
  if (!term) {
    console.error("No term in database. Seed terms first (npm run db:seed).");
    process.exit(1);
  }

  const program = await prisma.program.findFirst();
  if (!program) {
    console.error("No program in database. Run db:seed.");
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
  await prisma.account.deleteMany({ where: { email: { in: [PROF_EMAIL, DIR_EMAIL] } } });
  await prisma.faculty.deleteMany({ where: { email: { in: [PROF_EMAIL, DIR_EMAIL] } } });

  const templates = await prisma.courseTemplate.findMany({
    where: {
      programs: { some: { programId: program.id } },
    },
    include: { programs: { include: { program: true } } },
    take: 40,
  });
  const picked = templates
    .filter((t) => t.programs.length > 0 && t.programs.every((p) => !programExempt(p.program.name)))
    .slice(0, 3);
  if (picked.length < 3) {
    console.error(
      "Need 3 course templates in the first program with no exempt-only program link. Add templates or adjust program."
    );
    process.exit(1);
  }

  const phProf = await hashPassword(PROF_PASSWORD);
  const phDir = await hashPassword(DIR_PASSWORD);

  const dirAccount = await prisma.account.create({
    data: {
      email: DIR_EMAIL,
      role: "director",
      passwordHash: phDir,
      isAdmin: false,
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
  console.log("  Set these for Playwright (or rely on script defaults in the spec):");
  console.log(`  E2E_WF_PROF_EMAIL=${PROF_EMAIL}`);
  console.log(`  E2E_WF_PROF_PASSWORD=${PROF_PASSWORD}`);
  console.log(`  E2E_WF_DIR_EMAIL=${DIR_EMAIL}`);
  console.log(`  E2E_WF_DIR_PASSWORD=${DIR_PASSWORD}`);
  console.log("  E2E_WF_DEAN_EMAIL=… E2E_WF_DEAN_PASSWORD=…  (use your dean / admin test account)");

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
