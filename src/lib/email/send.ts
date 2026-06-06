// Transactional email via Resend (https://resend.com). Server-only.
//
// Needs RESEND_API_KEY. EMAIL_FROM should be an address on a domain you've
// verified in Resend (e.g. "IELTS Platform <noreply@yourdomain.com>"). Without
// a verified domain Resend's onboarding sender can only deliver to your own
// Resend account email — fine for testing.
//
// Every sender degrades gracefully: if RESEND_API_KEY is unset, we return
// { sent: false } instead of throwing, so the calling action still succeeds.
import "server-only";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://ielts-platform-pi.vercel.app";

type SendResult = { sent: boolean; error?: string };

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "Email isn't configured (no RESEND_API_KEY)." };
  const from = process.env.EMAIL_FROM || "IELTS Platform <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}

const shell = (inner: string) => `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px">
    <div style="background:linear-gradient(135deg,#6366f1,#7c5cf0 45%,#14b8a6);border-radius:16px;padding:24px;color:#fff">
      <div style="font-size:18px;font-weight:700">🎓 IELTS Practice Platform</div>
    </div>
    <div style="background:#fff;border:1px solid #e6e9f0;border-top:none;border-radius:0 0 16px 16px;padding:24px;color:#0f172a;line-height:1.55">
      ${inner}
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">
      You're receiving this because of an account on the IELTS Practice Platform.
    </p>
  </div>`;

/** Notifies a user that they've been granted admin access. */
export function sendAdminPromotionEmail(to: string, name?: string | null): Promise<SendResult> {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  return sendEmail({
    to,
    subject: "You're now an admin on the IELTS Practice Platform",
    html: shell(`
      <p style="margin:0 0 12px">${greeting}</p>
      <p style="margin:0 0 16px">
        You've been granted <strong>admin access</strong> on the IELTS Practice Platform.
        You can now upload tests, manage students, and promote other admins.
      </p>
      <a href="${SITE_URL}/admin"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600">
        Open the admin panel
      </a>
      <p style="margin:16px 0 0;color:#64748b;font-size:14px">
        If you weren't expecting this, you can ignore this email.
      </p>
    `),
  });
}
