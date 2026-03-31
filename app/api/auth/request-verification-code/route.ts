import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  createVerificationCode,
  isRateLimited,
  isCodeRequestRateLimited,
} from "@/lib/auth/verification";
import { sendEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, purpose } = body;
    if (!email || !purpose) {
      return NextResponse.json(
        { error: "Email and purpose required" },
        { status: 400 }
      );
    }

    if (purpose !== "account_setup" && purpose !== "sensitive_action") {
      return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (await isRateLimited(account.id)) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    if (await isCodeRequestRateLimited(account.id)) {
      return NextResponse.json(
        { error: "Too many code requests. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    const code = await createVerificationCode(account.id, purpose);
    try {
      await sendEmail(
        account.email,
        "Your verification code - Soka Academic Scheduling",
        `Your verification code is: ${code}\n\nThis code expires in 15 minutes.`
      );
    } catch (emailErr) {
      const latest = await prisma.verificationCode.findFirst({
        where: { accountId: account.id, purpose },
        orderBy: { createdAt: "desc" },
      });
      if (latest) {
        await prisma.verificationCode.delete({ where: { id: latest.id } });
      }
      console.error("Request verification email failed:", emailErr);
      const details =
        emailErr instanceof Error ? emailErr.message : "Unknown email error";
      return NextResponse.json(
        {
          error: "Could not send verification email. Check EmailJS / Resend configuration.",
          details,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: "Verification code sent" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
