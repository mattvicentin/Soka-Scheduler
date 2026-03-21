import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json({ valid: false, error: "Token required" }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { faculty: true },
    });

    if (!invitation) {
      return NextResponse.json({ valid: false });
    }

    if (invitation.usedAt) {
      return NextResponse.json({ valid: false, error: "Invitation already used" });
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ valid: false, error: "Invitation expired" });
    }

    const existingAccount = await prisma.account.findUnique({
      where: { facultyId: invitation.facultyId },
    });
    if (existingAccount) {
      return NextResponse.json({ valid: false, error: "Account already exists for this faculty" });
    }

    return NextResponse.json({
      valid: true,
      faculty_name: invitation.faculty.name,
      faculty_email: invitation.faculty.email,
      expires_at: invitation.expiresAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
