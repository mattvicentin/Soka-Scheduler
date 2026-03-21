/**
 * Extracts faculty and course offerings from Soka schedule PDFs.
 * Run: npm install && npm run db:extract-pdfs
 *
 * Looks for PDFs in: ~/Library/Application Support/Cursor/User/workspaceStorage/.../pdfs/
 * Or pass a directory: npx tsx scripts/extract-from-pdfs.ts /path/to/pdfs
 * Outputs prisma/import-data.json
 */

import * as fs from "fs";
import * as path from "path";
import { OTHERS_PROGRAM_NAME } from "../lib/constants/programs-catalog";

const TERM_BY_FILENAME: Record<string, string> = {
  "Spring 2023 Semester Schedule.pdf": "Spring 2023",
  "Fall 2023 Semester Schedule of Classes.pdf": "Fall 2023",
  "Spring 2024 Semester Schedule of Classes.pdf": "Spring 2024",
  "Fall Semester 2024 Schedule of Classes.pdf": "Fall 2024",
  "Spring 2025 Semester Schedule of Classes 01282025.pdf": "Spring 2025",
  "Fall 2025 Semester Schedule of Classes.pdf": "Fall 2025",
  "Spring 2026 Semester Schedule of Classes.pdf": "Spring 2026",
};

function nameToEmail(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return "unknown@soka.edu";
  const parts = n.split(" ").filter((p) => p && p !== "J.");
  const first = (parts[0] || "x").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const last = parts
    .slice(1)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return last ? `${first}.${last}@soka.edu` : `${first}@soka.edu`;
}

function coursePrefixToProgram(prefix: string): string {
  const m: Record<string, string> = {
    AMEREXP: "American Experience Area",
    ANTH: "Social and Behavioral Sciences Concentration",
    ARTHIST: "Humanities Concentration",
    ASTR: "Science and Math Program",
    BIO: "Life Sciences Concentration",
    BIOCHEM: "Life Sciences Concentration",
    CAPSTONE: OTHERS_PROGRAM_NAME,
    CAREER: OTHERS_PROGRAM_NAME,
    CARTS: "Creative Arts Program",
    CF: OTHERS_PROGRAM_NAME,
    CHI: "Language and Culture Program",
    CHEM: "Science and Math Program",
    CORE: "Core Area",
    DIST: OTHERS_PROGRAM_NAME,
    ECOL: "Life Sciences Concentration",
    ECON: "International Studies Concentration",
    EMP: "Environmental Studies Concentration",
    ENVST: "Environmental Studies Concentration",
    EOS: "Environmental Studies Concentration",
    FRN: "Language and Culture Program",
    GEOG: "Environmental Studies Concentration",
    HIST: "Humanities Concentration",
    HUM: "Humanities Concentration",
    IBC: "Science and Math Program",
    INQUIRY: "Modes of Inquiry Area",
    INTS: "International Studies Concentration",
    JPN: "Language and Culture Program",
    LIT: "Humanities Concentration",
    MATH: "Science and Math Program",
    MUSICENS: "Creative Arts Program",
    MUSICHST: "Creative Arts Program",
    PACBASIN: "Pacific Basin Area",
    PHIL: "Humanities Concentration",
    PHYS: "Science and Math Program",
    POLISCI: "International Studies Concentration",
    PSYCH: "Social and Behavioral Sciences Concentration",
    REL: "Humanities Concentration",
    SBS: "Social and Behavioral Sciences Concentration",
    SOC: "Social and Behavioral Sciences Concentration",
    SPA: "Language and Culture Program",
    WELL: OTHERS_PROGRAM_NAME,
    WRIT: "Writing Program",
  };
  return m[prefix] ?? OTHERS_PROGRAM_NAME;
}

interface ParsedOffering {
  courseCode: string;
  title: string;
  section: string;
  credits: number;
  instructor: string;
  term: string;
}

/** Line-by-line parser: expects one course code per line */
function parseScheduleTextLines(text: string, termName: string): ParsedOffering[] {
  const offerings: ParsedOffering[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trimEnd());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const courseMatch =
      line.match(/^([A-Z][A-Z0-9]+)\s+(\d+[A-Z]?)\s*[-–—]\s*(0?(\d+))?\s*$/) ||
      line.match(/^([A-Z][A-Z0-9]+)\s+(\d+[A-Z]?)\s*[-–—]\s*(0?(\d+))?\s+/) ||
      line.match(/^([A-Z][A-Z0-9]+)\s+(\d+[A-Z]?)\s*[-–—]\s*$/);
    if (!courseMatch) continue;

    const prefix = courseMatch[1];
    const num = courseMatch[2];
    let section = (courseMatch[3] || courseMatch[4] || "1").padStart(2, "0");
    const nextLine = lines[i + 1];
    if ((section === "01" || section === "1") && nextLine) {
      const sectionMatch = nextLine.match(/^0?(\d+)\s*\(\d+\)/);
      if (sectionMatch) section = sectionMatch[1].padStart(2, "0");
    }
    const courseCode = `${prefix} ${num}`;
    if (prefix === "SA") continue;

    let title = "";
    let credits = 3;
    let instructor = "";

    let lineOffset = 1;
    if (nextLine?.match(/^0?(\d+)\s*\(\d+\)/)) lineOffset = 2;
    const titleLine = lines[i + lineOffset];
    if (titleLine && titleLine.length > 3 && titleLine.length < 80 && !titleLine.match(/^\d+\s+\d+\/\d+/)) {
      const credMatch = titleLine.match(/^(.+?)\s+(\d)\s+\d+\/\d+/);
      if (credMatch) {
        title = credMatch[1].trim();
        credits = parseInt(credMatch[2], 10) || 3;
      } else {
        title = titleLine.trim();
      }
    }

    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      const n = lines[j];
      if (n.match(/^\d+\s+\d+\/\d+/)) {
        const m = n.match(/^(\d+)/);
        if (m) credits = parseInt(m[1], 10) || 3;
      }
      if (n.match(/^(MW|TuTh|WF|MWF|TuThF|M\s|Tu\s|W\s|Th\s|F\s)\s+[\d:]/)) {
        const im = n.match(/([A-Z][a-zA-Z\s\.\-']+)$/);
        if (im && im[1].length > 3 && im[1].length < 40) instructor = im[1].trim();
      }
      const instMatch = n.match(/([A-Z][a-zA-Z\s\.\-']+)$/);
      if (instMatch && instMatch[1].length > 3 && instMatch[1].length < 40 && !instructor) {
        instructor = instMatch[1].trim();
      }
      if (n.startsWith("--") || (j > i + 2 && n.match(/^[A-Z][A-Z0-9]+\s+\d+/))) break;
    }

    if (!title) title = courseCode;

    offerings.push({
      courseCode,
      title,
      section,
      credits,
      instructor,
      term: termName,
    });
  }
  return offerings;
}

/**
 * Fallback: pdf-parse often returns text with columns concatenated or minimal line breaks.
 * Search the full text for "PREFIX NUM -" and extract blocks.
 */
function parseScheduleTextBlock(text: string, termName: string): ParsedOffering[] {
  const offerings: ParsedOffering[] = [];
  const seen = new Set<string>();

  // Match course codes: AMEREXP 200 -, ANTH 100 - 01, BIO 110 - 01 (8091)
  const re = /([A-Z][A-Z0-9]+)\s+(\d+[A-Z]?)\s*[-–—]\s*(?:0?(\d+)\s*\(\d+\)|0?(\d+))?/g;
  let m: RegExpExecArray | null;
  const matches: { prefix: string; num: string; section: string; index: number }[] = [];

  while ((m = re.exec(text)) !== null) {
    const prefix = m[1];
    const num = m[2];
    const section = (m[3] || m[4] || "1").padStart(2, "0");
    if (prefix === "SA") continue;
    const key = `${prefix} ${num}-${section}-${termName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ prefix, num, section, index: m.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const { prefix, num, section } = matches[i];
    const courseCode = `${prefix} ${num}`;
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, Math.min(end, start + 600)).replace(/\s+/g, " ");

    // Title: text after course code until "3 1/1" or "4 1/1" or similar
    const credMatch = block.match(/\s+(\d)\s+\d+\/\d+/);
    const credits = credMatch ? parseInt(credMatch[1], 10) || 3 : 3;
    let title = block
      .replace(/^[A-Z0-9]+\s+\d+[A-Z]?\s*[-–—]\s*(?:\d+\s*\(\d+\)|\d+)?\s*/, "")
      .replace(/\s+\d\s+\d+\/\d+.*$/, "")
      .trim();
    if (title.length > 80) title = title.slice(0, 77) + "...";
    if (!title || title.length < 2) title = courseCode;

    // Instructor: capitalized name at end (e.g. "John Smith" or "J. Smith")
    const nameMatch = block.match(/([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s*$/);
    const instructor = nameMatch ? nameMatch[1].trim() : "";

    offerings.push({
      courseCode,
      title,
      section,
      credits,
      instructor,
      term: termName,
    });
  }
  return offerings;
}

function parseScheduleText(text: string, termName: string): ParsedOffering[] {
  const byLines = parseScheduleTextLines(text, termName);
  if (byLines.length > 0) return byLines;
  return parseScheduleTextBlock(text, termName);
}

async function main() {
  const pdfParse = (await import("pdf-parse")).default;
  const customDir = process.argv[2];
  const baseDir =
    customDir
      ? path.isAbsolute(customDir)
        ? customDir
        : path.join(process.cwd(), customDir)
      : path.join(process.cwd(), "Previous Semesters Schedules");

  if (!fs.existsSync(baseDir)) {
    console.error("PDF directory not found:", baseDir);
    console.error("Usage: npx tsx scripts/extract-from-pdfs.ts [pdf-directory]");
    process.exit(1);
  }

  const allOfferings: ParsedOffering[] = [];
  const templateMap = new Map<string, { title: string; credits: number; prefix: string }>();
  const facultySet = new Set<string>();

  let pdfPaths: string[] = [];
  const stat = fs.statSync(baseDir);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const sub = fs.readdirSync(path.join(baseDir, e.name));
        sub.forEach((f) => {
          if (f.endsWith(".pdf")) pdfPaths.push(path.join(baseDir, e.name, f));
        });
      } else if (e.name.endsWith(".pdf")) {
        pdfPaths.push(path.join(baseDir, e.name));
      }
    }
  }

  let debugWritten = false;
  for (const pdfPath of pdfPaths) {
    const f = path.basename(pdfPath);
    const termName = TERM_BY_FILENAME[f] || f.replace(/\.pdf$/, "");
    try {
      const buf = fs.readFileSync(pdfPath);
      const data = await pdfParse(buf);
      const text = data.text || "";
      const offerings = parseScheduleText(text, termName);
      for (const o of offerings) {
        const prefix = o.courseCode.split(" ")[0];
        if (!templateMap.has(o.courseCode)) {
          templateMap.set(o.courseCode, { title: o.title, credits: o.credits, prefix });
        }
        if (o.instructor) facultySet.add(o.instructor);
      }
      allOfferings.push(...offerings);
      console.log(`  ${termName}: ${offerings.length} offerings`);
      if (offerings.length === 0 && text.length > 100 && !debugWritten) {
        const debugPath = path.join(process.cwd(), "prisma", "pdf-debug.txt");
        fs.writeFileSync(
          debugPath,
          `=== ${f} (first 6000 chars) ===\n\n${text.slice(0, 6000)}\n\n=== (end) ===`,
          "utf-8"
        );
        console.warn(`  Debug: wrote raw PDF text to ${debugPath} - inspect to adjust parsing`);
        debugWritten = true;
      }
    } catch (e) {
      console.warn(`  Skip ${f}:`, (e as Error).message);
    }
  }

  const faculty = Array.from(facultySet).filter((n) => n.length > 2).sort();

  const courseTemplates = Array.from(templateMap.entries()).map(([code, v]) => ({
    course_code: code,
    title: v.title,
    credits: v.credits,
    typically_offered: "both" as const,
    program_names: [coursePrefixToProgram(v.prefix)],
  }));

  const courseOfferings = allOfferings
    .filter((o) => o.instructor && !o.courseCode.startsWith("SA "))
    .map((o) => ({
      course_code: o.courseCode,
      term_name: o.term,
      section_code: o.section,
      instructor_email: nameToEmail(o.instructor),
      load_share: 1,
    }));

  const facultyList = faculty.map((name) => ({
    email: nameToEmail(name),
    name,
    expected_annual_load: 5,
    program_names: [OTHERS_PROGRAM_NAME],
  }));

  const output = {
    faculty: facultyList,
    course_templates: courseTemplates,
    course_offerings: courseOfferings,
  };

  const outPath = path.join(__dirname, "../prisma/import-data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nWrote ${outPath}`);
  console.log(`  Faculty: ${facultyList.length}`);
  console.log(`  Course templates: ${courseTemplates.length}`);
  console.log(`  Course offerings: ${courseOfferings.length}`);
}

main().catch(console.error);
