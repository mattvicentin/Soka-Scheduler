/**
 * One-shot import from "Previous Semesters Schedules/Course Info _ IAN.xlsx"
 * into faculty, course_templates, and course_offerings (incl. team teaching).
 *
 * Run: npm run db:import:ian
 *
 * Prerequisites: npm run db:seed (programs must exist). Uses prisma/import-data.json
 * for legacy faculty email matches when names align.
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { runCatalogImport, type ImportData, type ImportCourseOffering } from "./catalog-import-shared";

const XLSX_PATH = path.join(
  __dirname,
  "../Previous Semesters Schedules/Course Info _ IAN.xlsx"
);
const LEGACY_IMPORT_JSON = path.join(__dirname, "../prisma/import-data.json");

/** Concentration / cross-list codes → canonical program name (seed catalog) */
const CONC_CODE_TO_PROGRAM: Record<string, string> = {
  SBS: "Social and Behavioral Sciences Concentration",
  INTS: "International Studies Concentration",
  INTA: "International Studies Concentration",
  HUM: "Humanities Concentration",
  CARTS: "Creative Arts Program",
  SCIMATH: "Science and Math Program",
  GRAD: "Others",
  OTHER: "Others",
  ENVST: "Environmental Studies Concentration",
  LCP: "Language and Culture Program",
  WRIT: "Writing Program",
  LS: "Life Sciences Concentration",
};

const NC_SUBJECT_TO_PROGRAM: Record<string, string> = {
  LRNCLSTR: "Learning Cluster Area",
  CAPSTONE: "Core Area",
  EUBP: "Others",
  SA: "Others",
  BIO: "Life Sciences Concentration",
};

const GE_SUBJECT_TO_PROGRAM: Record<string, string> = {
  CORE: "Core Area",
  INQUIRY: "Modes of Inquiry Area",
  PACBASIN: "Pacific Basin Area",
  AMEREXP: "American Experience Area",
  WELL: "Others",
  CF: "Learning Cluster Area",
};

const OTHERS = "Others";

function expandCode(code: string, subject: string): string[] {
  const c = code.trim();
  if (!c) return [];
  if (c === "NC") {
    const p = NC_SUBJECT_TO_PROGRAM[subject] ?? OTHERS;
    return [p];
  }
  if (c === "GE") {
    const p = GE_SUBJECT_TO_PROGRAM[subject] ?? OTHERS;
    return [p];
  }
  const p = CONC_CODE_TO_PROGRAM[c];
  if (p) return [p];
  console.warn(`  Unknown concentration code "${c}" (subject ${subject}) → Others`);
  return [OTHERS];
}

function programsForRow(r: Record<string, unknown>): string[] {
  const subject = String(r.Subject ?? "").trim();
  const conc = String(r.Concentration ?? "").trim();
  const xlist = String(r["Cross-List Concentration"] ?? "").trim();
  const set = new Set<string>();
  for (const code of [conc, xlist]) {
    if (!code) continue;
    for (const p of expandCode(code, subject)) set.add(p);
  }
  if (set.size === 0) set.add(OTHERS);
  return [...set];
}

function courseCodeFromRow(r: Record<string, unknown>): string {
  const sub = String(r.Subject ?? "").trim();
  const cat = String(r.Catalog ?? "").trim();
  return `${sub} ${cat}`.trim();
}

function normKeyLastFirst(last: string, first: string): string {
  return `${last.trim()}, ${first.trim()}`.toLowerCase().replace(/\s+/g, " ");
}

function displayName(last: string, first: string): string {
  return `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
}

function slugEmailPart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z-]/g, "");
}

function generatedEmail(last: string, first: string): string {
  const firstToken = slugEmailPart(first.split(/\s+/)[0] || "");
  const lastPart = slugEmailPart(last.split(/\s+/).join("") || "");
  return `${firstToken}.${lastPart}@soka.edu`;
}

function buildLegacyEmailMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(LEGACY_IMPORT_JSON)) return map;
  const raw = JSON.parse(fs.readFileSync(LEGACY_IMPORT_JSON, "utf-8"));
  for (const f of raw.faculty ?? []) {
    const name = String(f.name ?? "").trim();
    const parts = name.split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ");
    if (last) {
      map.set(normKeyLastFirst(last, first), f.email);
      map.set(name.toLowerCase().replace(/\s+/g, " "), f.email);
    }
  }
  return map;
}

function resolveEmail(
  last: string,
  first: string,
  legacy: Map<string, string>
): { email: string; fromLegacy: boolean } {
  const k1 = normKeyLastFirst(last, first);
  const k2 = displayName(last, first).toLowerCase();
  const hit = legacy.get(k1) ?? legacy.get(k2);
  if (hit) return { email: hit, fromLegacy: true };
  return { email: generatedEmail(last, first), fromLegacy: false };
}

interface SheetRow extends Record<string, unknown> {
  Year?: number;
  Semester?: string;
  "Class Nbr"?: number;
  Subject?: string;
  Catalog?: string;
  Concentration?: string;
  Last?: string;
  "First Name"?: string;
  Descr?: string;
  "Min Units"?: number;
  Descr2?: string;
  "Cross-List Concentration"?: string;
}

function forwardFillTerms(rows: SheetRow[]): void {
  let lastTerm = "";
  for (const r of rows) {
    let t = String(r.Descr2 ?? "").trim();
    if (/^(Fall|Spring)\s+\d{4}$/.test(t)) lastTerm = t;
    else if (!t && lastTerm) r.Descr2 = lastTerm;
  }
}

async function main() {
  const legacy = buildLegacyEmailMap();
  console.log(`Legacy name→email map: ${legacy.size} entries from import-data.json`);

  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets["Course data"];
  if (!sheet) throw new Error('Missing sheet "Course data"');
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
  forwardFillTerms(rows);

  const facultyPrograms = new Map<string, Set<string>>();
  const facultyMeta = new Map<string, { last: string; first: string; email: string; fromLegacy: boolean }>();

  const cleanTemplates = new Map<
    string,
    { title: string; credits: number | null; programs: Set<string>; terms: Set<"fall" | "spring"> }
  >();

  const offeringGroups = new Map<
    string,
    { termName: string; sectionCode: string; courseCode: string; crn: string; instructorEmails: string[] }
  >();

  for (const r of rows) {
    const termName = String(r.Descr2 ?? "").trim();
    if (!/^(Fall|Spring)\s+\d{4}$/.test(termName)) continue;

    const last = String(r.Last ?? "").trim();
    const first = String(r["First Name"] ?? "").trim();
    const cc = courseCodeFromRow(r);
    if (!cc || !cc.includes(" ")) continue;

    const programs = programsForRow(r);
    const title = String(r.Descr ?? "").trim() || cc;
    const creditsRaw = r["Min Units"];
    const credits =
      creditsRaw === "" || creditsRaw === undefined ? null : Math.round(Number(creditsRaw)) || null;
    const sem = termName.startsWith("Fall") ? ("fall" as const) : ("spring" as const);

    if (!cleanTemplates.has(cc)) {
      cleanTemplates.set(cc, {
        title,
        credits,
        programs: new Set(programs),
        terms: new Set([sem]),
      });
    } else {
      const tr = cleanTemplates.get(cc)!;
      programs.forEach((p) => tr.programs.add(p));
      tr.terms.add(sem);
      if (title.length > tr.title.length) tr.title = title;
      if (credits != null) tr.credits = credits;
    }

    const classNbr = String(r["Class Nbr"] ?? "").trim();
    if (!classNbr) continue;

    const ogKey = `${termName}|${classNbr}`;
    if (!offeringGroups.has(ogKey)) {
      offeringGroups.set(ogKey, {
        termName,
        sectionCode: classNbr,
        courseCode: cc,
        crn: classNbr,
        instructorEmails: [],
      });
    }
    const og = offeringGroups.get(ogKey)!;

    if (last && first) {
      const { email, fromLegacy } = resolveEmail(last, first, legacy);
      if (!facultyMeta.has(email)) {
        facultyMeta.set(email, { last, first, email, fromLegacy });
      }
      if (!facultyPrograms.has(email)) facultyPrograms.set(email, new Set());
      programs.forEach((p) => facultyPrograms.get(email)!.add(p));
      if (!og.instructorEmails.includes(email)) og.instructorEmails.push(email);
    }
  }

  const facultyList = [...facultyMeta.values()].map((m) => ({
    email: m.email,
    name: displayName(m.last, m.first),
    expected_annual_load: 5,
    program_names: [...(facultyPrograms.get(m.email) ?? new Set())].sort(),
  }));

  const course_templates = [...cleanTemplates.entries()].map(([course_code, tr]) => {
    let typically_offered: "fall" | "spring" | "both" | null = null;
    if (tr.terms.has("fall") && tr.terms.has("spring")) typically_offered = "both";
    else if (tr.terms.has("fall")) typically_offered = "fall";
    else if (tr.terms.has("spring")) typically_offered = "spring";
    return {
      course_code,
      title: tr.title,
      credits: tr.credits,
      typically_offered,
      program_names: [...tr.programs].sort(),
    };
  });

  const course_offerings: ImportCourseOffering[] = [];
  for (const og of offeringGroups.values()) {
    const uniq = [...new Set(og.instructorEmails)];
    if (uniq.length === 0) continue;
    const instructors = uniq.map((email) => ({ email, load_share: 1 / uniq.length }));
    course_offerings.push({
      course_code: og.courseCode,
      term_name: og.termName,
      section_code: og.sectionCode,
      instructors,
      crn: og.crn,
    });
  }

  const legacyHits = [...facultyMeta.values()].filter((m) => m.fromLegacy).length;
  console.log(
    `Faculty: ${facultyList.length} (${legacyHits} emails from legacy JSON, ${facultyList.length - legacyHits} generated)`
  );
  console.log(`Templates: ${course_templates.length}, Offerings: ${course_offerings.length}`);

  const data: ImportData = { faculty: facultyList, course_templates, course_offerings };

  const prisma = new PrismaClient();
  try {
    await runCatalogImport(prisma, data, "IAN XLSX");
    await verify(prisma, course_templates.length, course_offerings.length);
  } finally {
    await prisma.$disconnect();
  }
}

async function verify(prisma: PrismaClient, expectTemplates: number, expectOfferings: number) {
  const [fc, tc, oc, ic] = await Promise.all([
    prisma.faculty.count(),
    prisma.courseTemplate.count(),
    prisma.courseOffering.count(),
    prisma.courseOfferingInstructor.count(),
  ]);
  console.log("\n--- Verification (database totals) ---");
  console.log(`  faculty:            ${fc}`);
  console.log(`  courseTemplate:     ${tc} (batch wanted ${expectTemplates} codes)`);
  console.log(`  courseOffering:     ${oc} (batch ~${expectOfferings} section-keys)`);
  console.log(`  offeringInstructor: ${ic}`);
  const crossListSample = await prisma.courseTemplate.findFirst({
    where: { courseCode: "ECON 100" },
    include: { programs: { include: { program: { select: { name: true } } } } },
  });
  if (crossListSample) {
    console.log(
      "\n  Sample ECON 100 (cross-listed in sheet) programs:",
      crossListSample.programs.map((p) => p.program.name).join(", ")
    );
  }
  if (tc < expectTemplates * 0.9) {
    console.warn(`  Warning: templates ${tc} vs batch ${expectTemplates} — DB may already have had catalog data.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
