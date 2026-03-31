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

/** Railway / copy-paste often adds spaces, newlines, or wrapping quotes — EmailJS then returns “template not found”. */
function trimEnv(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  let s = value.trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.length > 0 ? s : undefined;
}

function getEmailJsConfig():
  | {
      serviceId: string;
      templateId: string;
      publicKey: string;
      privateKey: string;
    }
  | undefined {
  const serviceId = trimEnv(process.env.EMAILJS_SERVICE_ID);
  const templateId = trimEnv(process.env.EMAILJS_TEMPLATE_ID);
  const publicKey = trimEnv(process.env.EMAILJS_PUBLIC_KEY);
  const privateKey = trimEnv(process.env.EMAILJS_PRIVATE_KEY);
  if (!serviceId || !templateId || !publicKey || !privateKey) return undefined;
  return { serviceId, templateId, publicKey, privateKey };
}

function emailJsFullyConfigured(): boolean {
  return getEmailJsConfig() != null;
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
 *
 * email_html is plain text with newlines (no <br>). EmailJS/HTML escapes {{email_html}}, which would
 * show literal "<br>" if we injected HTML. Use in template: style white-space:pre-wrap, or {{{email_html}}} if your editor supports unescaped triple braces.
 */
async function sendViaEmailJs(
  to: string,
  subject: string,
  body: string,
  options?: { html?: string }
): Promise<void> {
  const cfg = getEmailJsConfig();
  if (!cfg) {
    throw new Error(
      "EmailJS requires EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY"
    );
  }
  const emailHtml = options?.html ?? body;
  const res = await fetch(EMAILJS_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: cfg.serviceId,
      template_id: cfg.templateId,
      user_id: cfg.publicKey,
      accessToken: cfg.privateKey,
      template_params: {
        to_email: to,
        email_subject: subject,
        email_body: body,
        email_html: emailHtml,
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
