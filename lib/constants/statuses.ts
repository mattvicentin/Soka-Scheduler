import type { ProposalStatus } from "@prisma/client";

export const PROPOSAL_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "revised",
  "approved",
  "finalized",
  "published",
] as const satisfies readonly ProposalStatus[];

export type ProposalStatusType = (typeof PROPOSAL_STATUSES)[number];
