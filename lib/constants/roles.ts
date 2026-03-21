import type { AccountRole } from "@prisma/client";

export const ACCOUNT_ROLES = ["professor", "director", "dean"] as const satisfies readonly AccountRole[];

export type AccountRoleType = (typeof ACCOUNT_ROLES)[number];
