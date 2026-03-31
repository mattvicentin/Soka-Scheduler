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
 * GET /api/invitations
 * Dean only. Query: faculty_id?
 */
export async function GET(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const facultyId = searchParams.get("faculty_id");

  const where = facultyId ? { facultyId } : {};
  const invitations = await prisma.invitation.findMany({
    where,
    include: { faculty: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: invitations.map((i) => ({
      id: i.id,
      faculty_id: i.facultyId,
      faculty_name: i.faculty.name,
      faculty_email: i.faculty.email,
      expires_at: i.expiresAt.toISOString(),
      used_at: i.usedAt?.toISOString() ?? null,
      status: i.usedAt ? "used" : i.expiresAt < new Date() ? "expired" : "pending",
    })),
  });
}

/**
 * POST /api/invitations
 * Dean only. Body: { faculty_id }
 */
export async function POST(request: Request) {
  const auth = await requireRole(request, ["dean"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { faculty_id: facultyId } = body;
    if (!facultyId) {
      return NextResponse.json({ error: "faculty_id required" }, { status: 400 });
    }

    const faculty = await prisma.faculty.findUnique({
      where: { id: facultyId },
    });
    if (!faculty) {
      return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
    }

    const existingAccount = await prisma.account.findUnique({
      where: { facultyId },
    });
    if (existingAccount) {
      return NextResponse.json({ error: "Account already exists for this faculty" }, { status: 400 });
    }

    const pending = await prisma.invitation.findFirst({
      where: {
        facultyId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      return NextResponse.json(
        { error: "Active invitation already exists for this faculty" },
        { status: 409 }
      );
    }

    const expiryDays = await getConfigWithDefault(CONFIG_KEYS.INVITATION_EXPIRY_DAYS, 7);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const token = generateSecureToken();
    const tokenHash = hashToken(token);

    const invitation = await prisma.invitation.create({
      data: {
        facultyId,
        tokenHash,
        expiresAt,
        createdByAccountId: auth.payload.accountId,
      },
      include: { faculty: true },
    });

    const link = `${BASE_URL}/accept-invitation?token=${token}`;
    const emailBody = `You have been invited to set up your account.\n\nClick the link below to get started (expires in ${expiryDays} days):\n\n${link}\n\nIf you did not expect this invitation, you can ignore this email.`;

    try {
      await sendEmail(
        faculty.email,
        "Invitation to Soka Academic Scheduling System",
        emailBody
      );
    } catch (emailErr) {
      await prisma.invitation.delete({ where: { id: invitation.id } });
      console.error("Create invitation email failed:", emailErr);
      const details =
        emailErr instanceof Error ? emailErr.message : "Unknown email error";
      return NextResponse.json(
        {
          error:
            "Invitation email could not be sent. No invitation was saved. Check EmailJS or Resend settings and Railway logs.",
          details,
        },
        { status: 502 }
      );
    }

    await logAudit("create_invitation", auth.payload.accountId, "invitation", invitation.id);

    return NextResponse.json({
      id: invitation.id,
      faculty_id: invitation.facultyId,
      faculty_name: invitation.faculty.name,
      expires_at: invitation.expiresAt.toISOString(),
      status: "pending",
    });
  } catch (e) {
    console.error("Create invitation error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
