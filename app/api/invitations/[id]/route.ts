import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/invitations/[id]
 * Dean only. Removes a pending or expired invitation so the faculty can be invited again.
 * Used invitations cannot be deleted (faculty already completed signup).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.usedAt) {
    return NextResponse.json(
      {
        error:
          "This invitation was already completed. You cannot re-invite until the faculty account is removed.",
      },
      { status: 400 }
    );
  }

  await prisma.invitation.delete({ where: { id } });
  await logAudit("delete_invitation", auth.payload.accountId, "invitation", id);

  return NextResponse.json({ ok: true });
}
