/**
 * Import faculty and courses from a JSON catalog.
 * Run: npm run db:import
 * Or: IMPORT_DATA_PATH=./prisma/foo.json npm run db:import
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import type { ImportData } from "./catalog-import-shared";
import { runCatalogImport } from "./catalog-import-shared";

const prisma = new PrismaClient();

async function main() {
  const rel = process.env.IMPORT_DATA_PATH ?? path.join(__dirname, "../prisma/import-data.json");
  const dataPath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data: ImportData = JSON.parse(raw);
  await runCatalogImport(prisma, data, dataPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
