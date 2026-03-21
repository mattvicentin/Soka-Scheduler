/**
 * Canonical academic units for Soka scheduling. Order = default UI order; "Others" is last.
 * Used by seed sync and API ordering.
 */
export const OTHERS_PROGRAM_NAME = "Others";

export type CatalogProgramType = "concentration" | "program" | "area";

export interface ProgramCatalogEntry {
  name: string;
  type: CatalogProgramType;
  /** Match faculty.name (case-insensitive); null if none */
  directorName: string | null;
  /** Former seed / DB names to rename or merge into this program */
  legacyNames?: string[];
}

export const PROGRAM_CATALOG: ProgramCatalogEntry[] = [
  {
    name: "Environmental Studies Concentration",
    type: "concentration",
    directorName: "Deike Peters",
    legacyNames: ["Environmental Studies"],
  },
  {
    name: "Humanities Concentration",
    type: "concentration",
    directorName: "John Kehlen",
    legacyNames: ["Humanities"],
  },
  {
    name: "International Studies Concentration",
    type: "concentration",
    directorName: "Lisa MacLeod",
    legacyNames: ["International Studies"],
  },
  {
    name: "Life Sciences Concentration",
    type: "concentration",
    directorName: "Zahra Afrasiabi",
    legacyNames: ["Life Sciences"],
  },
  {
    name: "Social and Behavioral Sciences Concentration",
    type: "concentration",
    directorName: "Edward Lowe",
    legacyNames: ["Social and Behavioral Sciences"],
  },
  {
    name: "Creative Arts Program",
    type: "program",
    directorName: "Don Ryan",
    legacyNames: ["Creative Arts"],
  },
  {
    name: "Language and Culture Program",
    type: "program",
    directorName: "Sandrine Siméon",
    legacyNames: [
      "Japanese Language and Literature",
      "Spanish Language and Literature",
      "English Language and Literature",
    ],
  },
  {
    name: "Science and Math Program",
    type: "program",
    directorName: "Jonathan Merzel",
    legacyNames: ["Mathematics and Computer Science", "Natural Sciences"],
  },
  {
    name: "Writing Program",
    type: "program",
    directorName: "Darin Ciccotelli",
    legacyNames: [],
  },
  {
    name: "American Experience Area",
    type: "area",
    directorName: "Peter Burns",
    legacyNames: ["American Studies"],
  },
  {
    name: "Core Area",
    type: "area",
    directorName: "Diya Mazumber",
    legacyNames: [],
  },
  {
    name: "Learning Cluster Area",
    type: "area",
    directorName: "Shane Barter",
    legacyNames: ["Learning Cluster"],
  },
  {
    name: "Modes of Inquiry Area",
    type: "area",
    directorName: "Tomás Crowder-Taraborrelli",
    legacyNames: [],
  },
  {
    name: "Pacific Basin Area",
    type: "area",
    directorName: "Sarah England",
    legacyNames: [],
  },
  {
    name: OTHERS_PROGRAM_NAME,
    type: "area",
    directorName: null,
    legacyNames: ["Other"],
  },
];
