/**
 * Transactional email — pluggable providers for PoC vs production.
 *
 * Providers (see docs/DEPLOYMENT.md):
 * - console: log only (local dev)
 * - emailjs: REST API + dashboard template (good PoC without DNS)
 * - resend: API + DNS-verified domain (production)
 *
 * Selection:
 * - EMAIL_PROVIDER=console | emailjs | resend forces that provider (if configured).
 * - If unset: Resend wins when RESEND_API_KEY is set; else EmailJS when all EMAILJS_* are set; else console.
 */

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

export type EmailProviderName = "console" | "emailjs" | "resend";

function emailJsFullyConfigured(): boolean {
  return Boolean(
    process.env.EMAILJS_SERVICE_ID &&
      process.env.EMAILJS_TEMPLATE_ID &&
      process.env.EMAILJS_PUBLIC_KEY &&
      process.env.EMAILJS_PRIVATE_KEY
  );
}

export function resolveEmailProvider(): EmailProviderName {
  const explicit = (process.env.EMAIL_PROVIDER ?? "").toLowerCase().trim();
  if (explicit === "console") return "console";
  if (explicit === "emailjs") return "emailjs";
  if (explicit === "resend") return "resend";

  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.length > 0) return "resend";
  if (emailJsFullyConfigured()) return "emailjs";
  return "console";
}

async function sendViaResend(
  to: string,
  subject: string,
  body: string,
  options?: { html?: string }
): Promise<void> {
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
    throw new Error(`Resend email failed: ${err}`);
  }
}

/**
 * EmailJS requires a dashboard template with these template parameters (or map them in the template UI):
 * - to_email, email_subject, email_body, email_html
 */
async function sendViaEmailJs(
  to: string,
  subject: string,
  body: string,
  options?: { html?: string }
): Promise<void> {
  if (!emailJsFullyConfigured()) {
    throw new Error(
      "EmailJS requires EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY"
    );
  }
  const html = options?.html ?? body.replace(/\n/g, "<br>");
  const res = await fetch(EMAILJS_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: to,
        email_subject: subject,
        email_body: body,
        email_html: html,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EmailJS send failed: ${res.status} ${err}`);
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options?: { html?: string }
): Promise<void> {
  const provider = resolveEmailProvider();

  if (provider === "console") {
    console.log("[Email]", { provider, to, subject, body: body.slice(0, 200) });
    return;
  }

  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("EMAIL_PROVIDER=resend but RESEND_API_KEY is missing");
    }
    await sendViaResend(to, subject, body, options);
    return;
  }

  if (provider === "emailjs") {
    await sendViaEmailJs(to, subject, body, options);
    return;
  }

  throw new Error(`Email provider "${provider}" not handled`);
}
