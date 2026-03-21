/**
 * Debug: print raw text from first PDF to see what pdf-parse returns
 */
import * as fs from "fs";
import * as path from "path";

async function main() {
  const pdfParse = (await import("pdf-parse")).default;
  const pdfPath = path.join(
    process.cwd(),
    "Previous Semesters Schedules/Fall 2023 Semester Schedule of Classes.pdf"
  );
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  const text = data.text || "";
  const lines = text.split("\n");
  console.log("First 80 lines:");
  lines.slice(0, 80).forEach((l, i) => console.log(`${i}: |${l}|`));
  console.log("\n--- Sample lines matching course pattern ---");
  const re = /^([A-Z][A-Z0-9]+)\s+(\d+[A-Z]?)\s*-\s*(?:0?(\d+)\s*\(\d+\)|0?(\d+))?\s*$/;
  lines.forEach((l, i) => {
    if (re.test(l)) console.log(`Match line ${i}: |${l}|`);
  });
  console.log("\n--- Lines containing AMEREXP ---");
  lines.forEach((l, i) => {
    if (l.includes("AMEREXP")) console.log(`${i}: |${l}|`);
  });
}

main().catch(console.error);
