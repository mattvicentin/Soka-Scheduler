import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

    const accountForEmail = await prisma.account.findFirst({
      where: {
        email: { equals: invitation.faculty.email, mode: "insensitive" },
      },
    });
    if (accountForEmail) {
      return NextResponse.json(
        {
          error:
            "This email is already registered. If it is your dean/admin login account, sign in from the login page with that password instead. Otherwise, ask a dean to use a different ADMIN_EMAIL so faculty can share the same address.",
        },
        { status: 409 }
      );
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

    let code: string;
    try {
      code = await createVerificationCode(account.id, "account_setup");
      await sendEmail(
        account.email,
        "Verify your account - Soka Academic Scheduling",
        `Your verification code is: ${code}\n\nThis code expires in 15 minutes.`
      );
    } catch (emailErr) {
      await prisma.$transaction(async (tx) => {
        await tx.verificationCode.deleteMany({ where: { accountId: account.id } });
        await tx.account.delete({ where: { id: account.id } });
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { usedAt: null },
        });
      });
      console.error("Accept invitation verification email failed:", emailErr);
      const details =
        emailErr instanceof Error ? emailErr.message : "Unknown email error";
      return NextResponse.json(
        {
          error:
            "Account was not created — verification email could not be sent. Try again after fixing email (EmailJS / Resend).",
          details,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: "Account created. Check your email for the verification code.",
      account_id: account.id,
    });
  } catch (e) {
    console.error("Accept invitation error:", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const targets = (e.meta?.target as string[] | undefined)?.join(", ") ?? "unique field";
      return NextResponse.json(
        {
          error: `Account could not be created (${targets} already in use). This email may already have an account.`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
