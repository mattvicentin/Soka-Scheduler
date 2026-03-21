/**
 * Import faculty and courses from prisma/import-data.json
 * Run: npm run db:import
 *
 * Data format: See import-data.json. Replace with your PDF-extracted data.
 * Idempotent: skips existing faculty (by email) and course templates (by course_code).
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface ImportFaculty {
  email: string;
  name: string;
  expected_annual_load: number;
  program_names: string[];
}

interface ImportCourseTemplate {
  course_code: string;
  title: string;
  credits?: number | null;
  typically_offered?: "fall" | "spring" | "both" | null;
  program_names: string[];
}

interface ImportCourseOffering {
  course_code: string;
  term_name: string;
  section_code: string;
  instructor_email: string;
  load_share?: number;
}

interface ImportData {
  faculty?: ImportFaculty[];
  course_templates?: ImportCourseTemplate[];
  course_offerings?: ImportCourseOffering[];
}

async function main() {
  const dataPath = path.join(__dirname, "../prisma/import-data.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ImportData = JSON.parse(raw);

  const facultyList = data.faculty ?? [];
  const templateList = data.course_templates ?? [];
  const offeringList = data.course_offerings ?? [];

  console.log("Importing from prisma/import-data.json...");
  console.log(`  Faculty: ${facultyList.length}, Templates: ${templateList.length}, Offerings: ${offeringList.length}`);

  // Resolve program names to IDs
  const programs = await prisma.program.findMany({ select: { id: true, name: true } });
  const programByName = new Map(programs.map((p) => [p.name, p.id]));

  const resolveProgramIds = (names: string[]): string[] => {
    const ids: string[] = [];
    for (const n of names) {
      const id = programByName.get(n);
      if (id) ids.push(id);
      else console.warn(`  Warning: Program "${n}" not found, skipping`);
    }
    return ids;
  };

  // 1. Ensure terms exist
  const termNames = [...new Set(offeringList.map((o) => o.term_name))];
  const termByName = new Map<string, string>();
  for (const name of termNames) {
    const m = name.match(/^(Fall|Spring)\s+(\d{4})$/);
    if (!m) {
      console.warn(`  Warning: Invalid term name "${name}", skipping offerings`);
      continue;
    }
    const semester = m[1].toLowerCase() as "fall" | "spring";
    const academicYear = parseInt(m[2], 10);
    const term = await prisma.term.upsert({
      where: { academicYear_semester: { academicYear, semester } },
      update: { name },
      create: { name, semester, academicYear },
    });
    termByName.set(name, term.id);
  }
  console.log(`  Terms: ${termByName.size} ensured`);

  // 2. Import faculty
  const facultyByEmail = new Map<string, string>();
  for (const f of facultyList) {
    const existing = await prisma.faculty.findUnique({ where: { email: f.email } });
    if (existing) {
      facultyByEmail.set(f.email, existing.id);
      continue;
    }
    const faculty = await prisma.faculty.create({
      data: {
        email: f.email,
        name: f.name,
        expectedAnnualLoad: f.expected_annual_load ?? 5,
      },
    });
    facultyByEmail.set(f.email, faculty.id);

    const programIds = resolveProgramIds(f.program_names ?? []);
    if (programIds.length > 0) {
      await prisma.facultyProgramAffiliation.createMany({
        data: programIds.map((programId, i) => ({
          facultyId: faculty.id,
          programId,
          isPrimary: i === 0,
        })),
      });
    }
  }
  console.log(`  Faculty: ${facultyByEmail.size} processed`);

  // 3. Import course templates
  const templateByCode = new Map<string, string>();
  for (const t of templateList) {
    const existing = await prisma.courseTemplate.findFirst({
      where: { courseCode: t.course_code },
    });
    if (existing) {
      templateByCode.set(t.course_code, existing.id);
      continue;
    }
    const programIds = resolveProgramIds(t.program_names ?? []);
    if (programIds.length === 0) {
      console.warn(`  Warning: No valid programs for ${t.course_code}, using Others`);
      const other = programByName.get("Others") ?? programByName.get("Other");
      if (other) programIds.push(other);
    }
    const template = await prisma.courseTemplate.create({
      data: {
        title: t.title,
        courseCode: t.course_code,
        credits: t.credits ?? null,
        typicallyOffered: t.typically_offered ?? null,
      },
    });
    templateByCode.set(t.course_code, template.id);
    if (programIds.length > 0) {
      await prisma.courseTemplateProgram.createMany({
        data: programIds.map((programId, i) => ({
          courseTemplateId: template.id,
          programId,
          displayOrder: i,
        })),
      });
    }
  }
  console.log(`  Course templates: ${templateByCode.size} in DB`);

  // 4. Import course offerings
  let created = 0;
  let skipped = 0;
  for (const o of offeringList) {
    const templateId = templateByCode.get(o.course_code);
    const termId = termByName.get(o.term_name);
    const facultyId = facultyByEmail.get(o.instructor_email);
    if (!templateId || !termId || !facultyId) {
      skipped++;
      continue;
    }
    const exists = await prisma.courseOffering.findUnique({
      where: {
        courseTemplateId_termId_sectionCode: {
          courseTemplateId: templateId,
          termId,
          sectionCode: o.section_code,
        },
      },
    });
    if (exists) {
      skipped++;
      continue;
    }
    const offering = await prisma.courseOffering.create({
      data: {
        courseTemplateId: templateId,
        termId,
        sectionCode: o.section_code,
        participatesInScheduling: true,
      },
    });
    await prisma.courseOfferingInstructor.create({
      data: {
        courseOfferingId: offering.id,
        facultyId,
        loadShare: o.load_share ?? 1,
        displayOrder: 0,
      },
    });
    created++;
  }
  console.log(`  Course offerings: ${created} created, ${skipped} skipped`);

  console.log("Import complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
