/**
 * Email service. Stub for development; wire to Resend/SendGrid in production.
 * Set EMAIL_PROVIDER=console for dev (logs to console).
 */

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options?: { html?: string }
): Promise<void> {
  // Console mode: default for dev. Resend mode: when RESEND_API_KEY present.
  const useResend = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.length > 0;
  const provider = useResend ? "resend" : (process.env.EMAIL_PROVIDER ?? "console");

  if (provider === "console") {
    console.log("[Email]", { to, subject, body: body.slice(0, 200) });
    return;
  }

  if (provider === "resend" && process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "noreply@soka.edu",
        to: [to],
        subject,
        text: body,
        html: options?.html ?? body.replace(/\n/g, "<br>"),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Email send failed: ${err}`);
    }
    return;
  }

  throw new Error(`Email provider ${provider} not configured`);
}
