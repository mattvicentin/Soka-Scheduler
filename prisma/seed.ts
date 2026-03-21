/**
 * Seed script for Soka Academic Scheduling System.
 * Run: npm run db:seed
 *
 * Seeds:
 * - system_config (baseline configuration)
 * - programs (canonical catalog: concentrations, programs, areas; syncs renames/merges)
 * - terms (sample Fall/Spring for current and next academic year)
 * - sample faculty (for invitation testing)
 * - admin account (from ADMIN_EMAIL + ADMIN_PASSWORD env)
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { PROGRAM_CATALOG } from "../lib/constants/programs-catalog";

const prisma = new PrismaClient();

const SYSTEM_CONFIG_DEFAULTS: Array<{ key: string; value: Prisma.InputJsonValue }> = [
  { key: "max_class_duration_minutes", value: 180 },
  { key: "allowed_start_minutes", value: [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] },
  { key: "faculty_conflict_policy", value: "warn" }, // crowded-period warn vs block (see CONFIG_KEYS.CROWDED_PERIOD_POLICY)
  { key: "busy_slot_start_hour", value: 10 },
  { key: "busy_slot_end_hour", value: 15 },
  { key: "heatmap_faculty_threshold", value: 5 },
  { key: "crowded_slot_threshold", value: 3 },
  { key: "load_period", value: "academic_year" },
  { key: "invitation_expiry_days", value: 7 },
  { key: "verification_code_expiry_minutes", value: 15 },
];

async function resolveDirectorAccountId(directorName: string | null): Promise<string | null> {
  if (!directorName?.trim()) return null;
  const name = directorName.trim();
  const account = await prisma.account.findFirst({
    where: {
      faculty: { name: { equals: name, mode: "insensitive" } },
    },
    select: { id: true },
  });
  return account?.id ?? null;
}

/** Rewire FKs from one program to another, then delete the source program. */
async function mergeProgramInto(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;

  const ctps = await prisma.courseTemplateProgram.findMany({ where: { programId: sourceId } });
  for (const link of ctps) {
    const exists = await prisma.courseTemplateProgram.findUnique({
      where: {
        courseTemplateId_programId: {
          courseTemplateId: link.courseTemplateId,
          programId: targetId,
        },
      },
    });
    if (exists) {
      await prisma.courseTemplateProgram.delete({
        where: {
          courseTemplateId_programId: {
            courseTemplateId: link.courseTemplateId,
            programId: sourceId,
          },
        },
      });
    } else {
      await prisma.courseTemplateProgram.update({
        where: {
          courseTemplateId_programId: {
            courseTemplateId: link.courseTemplateId,
            programId: sourceId,
          },
        },
        data: { programId: targetId },
      });
    }
  }

  const fas = await prisma.facultyProgramAffiliation.findMany({ where: { programId: sourceId } });
  for (const fa of fas) {
    const clash = await prisma.facultyProgramAffiliation.findUnique({
      where: { facultyId_programId: { facultyId: fa.facultyId, programId: targetId } },
    });
    if (clash) {
      await prisma.facultyProgramAffiliation.delete({
        where: { facultyId_programId: { facultyId: fa.facultyId, programId: sourceId } },
      });
    } else {
      await prisma.facultyProgramAffiliation.update({
        where: { facultyId_programId: { facultyId: fa.facultyId, programId: sourceId } },
        data: { programId: targetId },
      });
    }
  }

  const aps = await prisma.accountProgramAssociation.findMany({ where: { programId: sourceId } });
  for (const ap of aps) {
    const clash = await prisma.accountProgramAssociation.findUnique({
      where: { accountId_programId: { accountId: ap.accountId, programId: targetId } },
    });
    if (clash) {
      await prisma.accountProgramAssociation.delete({
        where: { accountId_programId: { accountId: ap.accountId, programId: sourceId } },
      });
    } else {
      await prisma.accountProgramAssociation.update({
        where: { accountId_programId: { accountId: ap.accountId, programId: sourceId } },
        data: { programId: targetId },
      });
    }
  }

  await prisma.program.delete({ where: { id: sourceId } });
}

async function syncProgramsFromCatalog() {
  for (const entry of PROGRAM_CATALOG) {
    const directorAccountId = await resolveDirectorAccountId(entry.directorName);

    let target = await prisma.program.findFirst({ where: { name: entry.name } });

    if (!target) {
      const legacy = entry.legacyNames ?? [];
      for (const legacyName of legacy) {
        const old = await prisma.program.findFirst({ where: { name: legacyName } });
        if (old) {
          target = await prisma.program.update({
            where: { id: old.id },
            data: {
              name: entry.name,
              type: entry.type,
              directorAccountId,
            },
          });
          break;
        }
      }
    }

    if (!target) {
      target = await prisma.program.create({
        data: {
          name: entry.name,
          type: entry.type,
          directorAccountId,
        },
      });
    } else {
      await prisma.program.update({
        where: { id: target.id },
        data: { type: entry.type, directorAccountId },
      });
    }

    const legacy = entry.legacyNames ?? [];
    for (const legacyName of legacy) {
      const dup = await prisma.program.findFirst({ where: { name: legacyName } });
      if (dup && dup.id !== target.id) {
        await mergeProgramInto(dup.id, target.id);
      }
    }
  }
}

const TERMS = [
  { name: "Spring 2023", semester: "spring" as const, academicYear: 2023 },
  { name: "Fall 2023", semester: "fall" as const, academicYear: 2023 },
  { name: "Spring 2024", semester: "spring" as const, academicYear: 2024 },
  { name: "Fall 2024", semester: "fall" as const, academicYear: 2024 },
  { name: "Spring 2025", semester: "spring" as const, academicYear: 2025 },
  { name: "Fall 2025", semester: "fall" as const, academicYear: 2025 },
  { name: "Spring 2026", semester: "spring" as const, academicYear: 2026 },
];

async function main() {
  console.log("Seeding database...");

  // 1. System config
  for (const { key, value } of SYSTEM_CONFIG_DEFAULTS) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  console.log("  - system_config seeded (10 keys)");

  // 2. Programs (canonical list + legacy renames / merges)
  await syncProgramsFromCatalog();
  console.log(`  - programs synced (${PROGRAM_CATALOG.length} units)`);

  // 3. Terms
  for (const term of TERMS) {
    await prisma.term.upsert({
      where: {
        academicYear_semester: { academicYear: term.academicYear, semester: term.semester },
      },
      update: { name: term.name },
      create: {
        name: term.name,
        semester: term.semester,
        academicYear: term.academicYear,
      },
    });
  }
  console.log(`  - terms seeded (${TERMS.length} terms)`);

  // 4. Sample faculty (idempotent: for invitation testing)
  const sampleFaculty = { email: "professor@test.edu", name: "Sample Professor", expectedAnnualLoad: 5 };
  const existingFaculty = await prisma.faculty.findUnique({
    where: { email: sampleFaculty.email },
  });
  if (!existingFaculty) {
    await prisma.faculty.create({
      data: sampleFaculty,
    });
    console.log("  - sample faculty created (professor@test.edu)");
  } else {
    console.log("  - sample faculty exists (professor@test.edu)");
  }

  // 4b. Test faculty with account (iread@soka.edu)
  const testFacultyEmail = "iread@soka.edu";
  const testFacultyPassword = "12345678i";
  let testFaculty = await prisma.faculty.findUnique({
    where: { email: testFacultyEmail },
    include: { account: true },
  });
  if (!testFaculty) {
    testFaculty = await prisma.faculty.create({
      data: {
        email: testFacultyEmail,
        name: "I Read",
        expectedAnnualLoad: 5,
      },
      include: { account: true },
    });
    console.log("  - test faculty created (iread@soka.edu)");
  }
  const passwordHash = await hashPassword(testFacultyPassword);
  await prisma.account.upsert({
    where: { email: testFacultyEmail },
    update: { passwordHash, facultyId: testFaculty.id },
    create: {
      email: testFacultyEmail,
      passwordHash,
      role: "professor",
      facultyId: testFaculty.id,
    },
  });
  console.log("  - test faculty account created/updated (iread@soka.edu)");

  // 4c. Director account (Matheus Vicentin)
  const directorEmail = "mattvicentin@soka.edu";
  const directorPassword = "14253669m";
  let directorFaculty = await prisma.faculty.findUnique({
    where: { email: directorEmail },
    include: { account: true },
  });
  if (!directorFaculty) {
    directorFaculty = await prisma.faculty.create({
      data: {
        email: directorEmail,
        name: "Matheus Vicentin",
        expectedAnnualLoad: 5,
      },
      include: { account: true },
    });
    console.log("  - director faculty created (mattvicentin@soka.edu)");
  }
  const directorPasswordHash = await hashPassword(directorPassword);
  await prisma.account.upsert({
    where: { email: directorEmail },
    update: { passwordHash: directorPasswordHash, facultyId: directorFaculty.id, role: "director" },
    create: {
      email: directorEmail,
      passwordHash: directorPasswordHash,
      role: "director",
      facultyId: directorFaculty.id,
    },
  });
  console.log("  - director account created/updated (mattvicentin@soka.edu)");

  // 4d. Program associations: sample director + test faculty on International Studies Concentration
  const intlStudiesProgram = await prisma.program.findFirst({
    where: { name: "International Studies Concentration" },
  });
  if (intlStudiesProgram) {
    const directorAccount = await prisma.account.findUnique({ where: { email: directorEmail } });
    if (directorAccount) {
      await prisma.accountProgramAssociation.upsert({
        where: {
          accountId_programId: { accountId: directorAccount.id, programId: intlStudiesProgram.id },
        },
        update: {},
        create: { accountId: directorAccount.id, programId: intlStudiesProgram.id },
      });
      console.log("  - director associated with International Studies Concentration");
    }
    await prisma.facultyProgramAffiliation.upsert({
      where: {
        facultyId_programId: { facultyId: testFaculty.id, programId: intlStudiesProgram.id },
      },
      update: {},
      create: { facultyId: testFaculty.id, programId: intlStudiesProgram.id },
    });
    console.log("  - test faculty (I Read) affiliated with International Studies Concentration");
  }

  // 5. Admin account
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@soka.edu";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminPassword) {
    const passwordHash = await hashPassword(adminPassword);

    await prisma.account.upsert({
      where: { email: adminEmail },
      update: { passwordHash },
      create: {
        email: adminEmail,
        passwordHash,
        role: "dean",
        isAdmin: true,
      },
    });
    console.log("  - admin account created/updated");
  } else {
    const existing = await prisma.account.findUnique({
      where: { email: adminEmail },
    });
    if (existing) {
      console.log("  - admin account exists (ADMIN_PASSWORD not set; password unchanged)");
    } else {
      console.log(
        "  - ADMIN_PASSWORD not set; admin account not created. Set env and re-run seed to create."
      );
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
