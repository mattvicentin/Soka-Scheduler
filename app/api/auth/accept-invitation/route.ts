import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { createVerificationCode } from "@/lib/auth/verification";
import { sendEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, email, password } = body;
    if (!token || !email || !password) {
      return NextResponse.json(
        { error: "Token, email, and password required" },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { faculty: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    }

    if (invitation.usedAt) {
      return NextResponse.json({ error: "Invitation already used" }, { status: 400 });
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
    }

    if (email.toLowerCase() !== invitation.faculty.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email must match the faculty record" },
        { status: 400 }
      );
    }

    const existingAccount = await prisma.account.findUnique({
      where: { facultyId: invitation.facultyId },
    });
    if (existingAccount) {
      return NextResponse.json({ error: "Account already exists" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const account = await prisma.$transaction(async (tx) => {
      const acc = await tx.account.create({
        data: {
          email: invitation.faculty.email,
          passwordHash,
          facultyId: invitation.facultyId,
          role: "professor",
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });
      return acc;
    });

    const code = await createVerificationCode(account.id, "account_setup");
    await sendEmail(
      account.email,
      "Verify your account - Soka Academic Scheduling",
      `Your verification code is: ${code}\n\nThis code expires in 15 minutes.`
    );

    return NextResponse.json({
      message: "Account created. Check your email for the verification code.",
      account_id: account.id,
    });
  } catch (e) {
    console.error("Accept invitation error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
