import { prisma } from "@/lib/db/client";

const AUDIT_ACTIONS = [
  "exclude_faculty",
  "include_faculty",
  "change_role",
  "change_permission",
  "publish_schedule",
  "create_invitation",
  "delete_invitation",
  "slot_create",
  "slot_update",
  "slot_delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export async function logAudit(
  action: AuditAction,
  actorAccountId: string,
  entityType: string,
  entityId: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      actorAccountId,
    },
  });
}
