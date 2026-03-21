import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/middleware";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { getConfigWithDefault } from "@/lib/config";
import { CONFIG_KEYS } from "@/lib/constants/config-keys";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * POST /api/invitations/invite-all
 * Dean only. Creates invitations for all faculty who don't have accounts and don't have pending invitations.
 */
export async function POST(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const facultyWithAccounts = await prisma.account.findMany({
    where: { facultyId: { not: null } },
    select: { facultyId: true },
  });
  const accountFacultyIds = new Set(
    facultyWithAccounts.map((a) => a.facultyId).filter(Boolean) as string[]
  );

  const pendingInvitations = await prisma.invitation.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    select: { facultyId: true },
  });
  const pendingFacultyIds = new Set(pendingInvitations.map((i) => i.facultyId));

  const facultyToInvite = await prisma.faculty.findMany({
    where: {
      id: { notIn: [...Array.from(accountFacultyIds), ...Array.from(pendingFacultyIds)] },
    },
    orderBy: { name: "asc" },
  });

  if (facultyToInvite.length === 0) {
    return NextResponse.json({
      created: 0,
      message: "All faculty already have accounts or pending invitations.",
    });
  }

  const expiryDays = await getConfigWithDefault(CONFIG_KEYS.INVITATION_EXPIRY_DAYS, 7);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  let created = 0;

  for (const faculty of facultyToInvite) {
    const token = generateSecureToken();
    const tokenHash = hashToken(token);

    const invitation = await prisma.invitation.create({
      data: {
        facultyId: faculty.id,
        tokenHash,
        expiresAt,
        createdByAccountId: auth.payload.accountId,
      },
    });

    const link = `${BASE_URL}/accept-invitation?token=${token}`;
    await sendEmail(
      faculty.email,
      "Invitation to Soka Academic Scheduling System",
      `You have been invited to set up your account.\n\nClick the link below to get started (expires in ${expiryDays} days):\n\n${link}\n\nIf you did not expect this invitation, you can ignore this email.`
    );

    await logAudit("create_invitation", auth.payload.accountId, "invitation", invitation.id);
    created++;
  }

  return NextResponse.json({
    created,
    message: `Created ${created} invitation(s) for faculty without accounts.`,
  });
}
