/**
 * Shared Prisma import for faculty, course templates, and offerings.
 * Used by import-from-catalog.ts and import-from-ian-xlsx.ts
 */

import { randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export interface ImportFaculty {
  email: string;
  name: string;
  expected_annual_load: number;
  program_names: string[];
}

export interface ImportCourseTemplate {
  course_code: string;
  title: string;
  credits?: number | null;
  typically_offered?: "fall" | "spring" | "both" | null;
  program_names: string[];
}

export interface ImportOfferingInstructor {
  email: string;
  load_share?: number;
}

export interface ImportCourseOffering {
  course_code: string;
  term_name: string;
  section_code: string;
  /** Legacy single instructor */
  instructor_email?: string;
  /** Team teaching: multiple instructors; load_share normalized to sum ≈ 1 */
  instructors?: ImportOfferingInstructor[];
  load_share?: number;
  crn?: string | null;
}

export interface ImportData {
  faculty?: ImportFaculty[];
  course_templates?: ImportCourseTemplate[];
  course_offerings?: ImportCourseOffering[];
}

function normalizeInstructors(o: ImportCourseOffering): ImportOfferingInstructor[] {
  if (Array.isArray(o.instructors) && o.instructors.length > 0) {
    const list = o.instructors.filter((i) => i.email?.trim());
    if (list.length === 0) return [];
    let shares = list.map((i) => Math.max(0.01, i.load_share ?? 1));
    const sum = shares.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.02) {
      const eq = 1 / list.length;
      shares = list.map(() => eq);
    }
    return list.map((i, idx) => ({ email: i.email.trim(), load_share: shares[idx] }));
  }
  if (o.instructor_email?.trim()) {
    return [{ email: o.instructor_email.trim(), load_share: o.load_share ?? 1 }];
  }
  return [];
}

function mergeFacultyByEmail(facultyList: ImportFaculty[]): ImportFaculty[] {
  const m = new Map<string, ImportFaculty>();
  for (const f of facultyList) {
    const cur = m.get(f.email);
    if (!cur) {
      m.set(f.email, {
        ...f,
        program_names: [...(f.program_names ?? [])],
      });
      continue;
    }
    const programs = new Set([...(cur.program_names ?? []), ...(f.program_names ?? [])]);
    m.set(f.email, {
      ...cur,
      name: (f.name?.length ?? 0) > (cur.name?.length ?? 0) ? f.name : cur.name,
      expected_annual_load: f.expected_annual_load ?? cur.expected_annual_load,
      program_names: [...programs],
    });
  }
  return [...m.values()];
}

function mergeTemplatesByCode(templateList: ImportCourseTemplate[]): Map<string, ImportCourseTemplate> {
  const m = new Map<string, ImportCourseTemplate>();
  for (const t of templateList) {
    const cur = m.get(t.course_code);
    if (!cur) {
      m.set(t.course_code, {
        course_code: t.course_code,
        title: t.title,
        credits: t.credits ?? null,
        typically_offered: t.typically_offered ?? null,
        program_names: [...(t.program_names ?? [])],
      });
      continue;
    }
    const programs = new Set([...(cur.program_names ?? []), ...(t.program_names ?? [])]);
    let title = cur.title;
    if ((t.title?.length ?? 0) > title.length) title = t.title;
    let credits = cur.credits;
    if (t.credits != null) credits = t.credits;
    let typ: "fall" | "spring" | "both" | null = cur.typically_offered ?? null;
    const tt = t.typically_offered ?? null;
    if (typ === "both" || tt === "both") typ = "both";
    else if (typ && tt && typ !== tt) typ = "both";
    else typ = typ ?? tt;
    m.set(t.course_code, {
      course_code: t.course_code,
      title,
      credits,
      typically_offered: typ,
      program_names: [...programs],
    });
  }
  return m;
}

function offeringDedupeKey(templateId: string, termId: string, sectionCode: string) {
  return `${templateId}|${termId}|${sectionCode}`;
}

export async function runCatalogImport(prisma: PrismaClient, data: ImportData, label: string) {
  const facultyList = mergeFacultyByEmail(data.faculty ?? []);
  const templateList = data.course_templates ?? [];
  const offeringList = data.course_offerings ?? [];
  const templatesMerged = mergeTemplatesByCode(templateList);

  console.log(`Importing (${label})...`);
  console.log(`  Faculty: ${facultyList.length}, Templates: ${templateList.length}, Offerings: ${offeringList.length}`);

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

  const termNames = [...new Set(offeringList.map((o) => o.term_name))];
  const termByName = new Map<string, string>();
  for (const name of termNames) {
    const m = name.match(/^(Fall|Spring)\s+(\d{4})$/);
    if (!m) {
      console.warn(`  Warning: Invalid term name "${name}", skipping offerings for that term`);
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

  const facultyEmails = facultyList.map((f) => f.email);
  const existingFaculty = await prisma.faculty.findMany({
    where: { email: { in: facultyEmails } },
    select: { id: true, email: true },
  });
  const facultyByEmail = new Map(existingFaculty.map((f) => [f.email, f.id]));

  const toCreateFaculty = facultyList.filter((f) => !facultyByEmail.has(f.email));
  const newFacultyRows = toCreateFaculty.map((f) => ({
    id: randomUUID(),
    email: f.email,
    name: f.name,
    expectedAnnualLoad: f.expected_annual_load ?? 5,
  }));
  const newFacultyIdByEmail = new Map(toCreateFaculty.map((f, i) => [f.email, newFacultyRows[i].id]));

  if (newFacultyRows.length > 0) {
    await prisma.faculty.createMany({ data: newFacultyRows });
    const affRows: { facultyId: string; programId: string; isPrimary: boolean }[] = [];
    for (const f of toCreateFaculty) {
      const fid = newFacultyIdByEmail.get(f.email)!;
      const programIds = resolveProgramIds(f.program_names ?? []);
      programIds.forEach((programId, i) =>
        affRows.push({ facultyId: fid, programId, isPrimary: i === 0 })
      );
    }
    if (affRows.length > 0) {
      await prisma.facultyProgramAffiliation.createMany({ data: affRows, skipDuplicates: true });
    }
  }
  for (const f of facultyList) {
    if (!facultyByEmail.has(f.email)) {
      facultyByEmail.set(f.email, newFacultyIdByEmail.get(f.email)!);
    }
  }
  console.log(`  Faculty: ${facultyByEmail.size} resolved in DB`);

  const allCodes = [...templatesMerged.keys()];
  const existingTemplates = await prisma.courseTemplate.findMany({
    where: { courseCode: { in: allCodes } },
    select: { id: true, courseCode: true },
  });
  const templateByCode = new Map(existingTemplates.map((t) => [t.courseCode, t.id]));

  const newTemplateRows: {
    id: string;
    title: string;
    courseCode: string;
    credits: number | null;
    typicallyOffered: "fall" | "spring" | "both" | null;
  }[] = [];
  const templateProgramRows: { courseTemplateId: string; programId: string; displayOrder: number }[] = [];

  for (const [courseCode, t] of templatesMerged) {
    if (templateByCode.has(courseCode)) continue;
    const id = randomUUID();
    newTemplateRows.push({
      id,
      title: t.title,
      courseCode,
      credits: t.credits ?? null,
      typicallyOffered: t.typically_offered ?? null,
    });
    templateByCode.set(courseCode, id);
    let programIds = resolveProgramIds(t.program_names ?? []);
    if (programIds.length === 0) {
      console.warn(`  Warning: No valid programs for ${courseCode}, using Others`);
      const other = programByName.get("Others") ?? programByName.get("Other");
      if (other) programIds = [other];
    }
    programIds.forEach((programId, i) =>
      templateProgramRows.push({ courseTemplateId: id, programId, displayOrder: i })
    );
  }

  if (newTemplateRows.length > 0) {
    await prisma.courseTemplate.createMany({ data: newTemplateRows });
    if (templateProgramRows.length > 0) {
      await prisma.courseTemplateProgram.createMany({ data: templateProgramRows, skipDuplicates: true });
    }
  }
  console.log(`  Course templates lookup: ${templateByCode.size} codes`);

  const termIds = [...new Set(termByName.values())];
  const existingOfferings =
    termIds.length === 0
      ? []
      : await prisma.courseOffering.findMany({
          where: { termId: { in: termIds } },
          select: { courseTemplateId: true, termId: true, sectionCode: true },
        });
  const existingOfferingKeys = new Set(
    existingOfferings.map((o) => offeringDedupeKey(o.courseTemplateId, o.termId, o.sectionCode))
  );

  let created = 0;
  let skipped = 0;
  const offeringRows: {
    id: string;
    courseTemplateId: string;
    termId: string;
    sectionCode: string;
    crn: string | null;
  }[] = [];
  const instructorRows: {
    courseOfferingId: string;
    facultyId: string;
    loadShare: Prisma.Decimal;
    displayOrder: number;
  }[] = [];

  for (const o of offeringList) {
    const templateId = templateByCode.get(o.course_code);
    const termId = termByName.get(o.term_name);
    const instList = normalizeInstructors(o);
    if (!templateId || !termId || instList.length === 0) {
      skipped++;
      continue;
    }
    const facultyIds: string[] = [];
    let facultyMissing = false;
    for (const ins of instList) {
      const fid = facultyByEmail.get(ins.email);
      if (!fid) {
        skipped++;
        facultyMissing = true;
        break;
      }
      facultyIds.push(fid);
    }
    if (facultyMissing) continue;
    if (facultyIds.length !== instList.length) continue;

    const okey = offeringDedupeKey(templateId, termId, o.section_code);
    if (existingOfferingKeys.has(okey)) {
      skipped++;
      continue;
    }
    existingOfferingKeys.add(okey);

    const oid = randomUUID();
    offeringRows.push({
      id: oid,
      courseTemplateId: templateId,
      termId,
      sectionCode: o.section_code,
      crn: o.crn?.trim() || null,
    });
    instList.forEach((ins, i) => {
      instructorRows.push({
        courseOfferingId: oid,
        facultyId: facultyIds[i],
        loadShare: new Prisma.Decimal(String(ins.load_share ?? 1 / instList.length)),
        displayOrder: i,
      });
    });
    created++;
  }

  if (offeringRows.length > 0) {
    await prisma.courseOffering.createMany({ data: offeringRows });
    await prisma.courseOfferingInstructor.createMany({ data: instructorRows, skipDuplicates: true });
  }
  console.log(`  Course offerings: ${created} created, ${skipped} skipped`);

  console.log("Import complete.");
}
