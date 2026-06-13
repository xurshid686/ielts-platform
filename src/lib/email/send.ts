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

/** Weekly progress digest. Mirrors the in-app weekly_report notification. */
export function sendWeeklyReportEmail(
  to: string,
  opts: { name?: string | null; tests: number; avgBand: number | null; bestBand: number | null },
): Promise<SendResult> {
  const greeting = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";
  const stat = (label: string, value: string) => `
    <td style="padding:10px 14px;background:#f8fafc;border:1px solid #e6e9f0;border-radius:10px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#0f172a">${value}</div>
      <div style="font-size:12px;color:#64748b">${label}</div>
    </td>`;
  return sendEmail({
    to,
    subject: "📊 Your weekly IELTS progress report",
    html: shell(`
      <p style="margin:0 0 12px">${greeting}</p>
      <p style="margin:0 0 16px">Here's how your week went on the IELTS Practice Platform:</p>
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 18px">
        <tr>
          ${stat("Tests", String(opts.tests))}
          ${stat("Avg band", opts.avgBand != null ? opts.avgBand.toFixed(1) : "—")}
          ${stat("Best band", opts.bestBand != null ? opts.bestBand.toFixed(1) : "—")}
        </tr>
      </table>
      <a href="${SITE_URL}/dashboard"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600">
        See your full dashboard
      </a>
    `),
  });
}

/** Daily nudge to keep a streak alive. Sent only to users who haven't practised today. */
export function sendStreakReminderEmail(
  to: string,
  opts: { name?: string | null; streak: number },
): Promise<SendResult> {
  const greeting = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";
  return sendEmail({
    to,
    subject: `🔥 Keep your ${opts.streak}-day streak alive`,
    html: shell(`
      <p style="margin:0 0 12px">${greeting}</p>
      <p style="margin:0 0 16px">
        You're on a <strong>${opts.streak}-day streak</strong> 🔥 — but you haven't
        practised yet today. A single test keeps it going.
      </p>
      <a href="${SITE_URL}/reading"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600">
        Take a quick test
      </a>
      <p style="margin:16px 0 0;color:#64748b;font-size:14px">
        You can manage email reminders in your account settings.
      </p>
    `),
  });
}

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
