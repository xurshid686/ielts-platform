import { attachmentDisposition } from "@/lib/content-disposition";
import { attemptForReportCode } from "@/lib/mock-sms";
import { buildAttemptReport } from "@/lib/mock-report";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { EMAIL_BASE_URL } from "@/lib/email/send";

// The link in the result SMS (0071): https://mockonline.uz/a/<code>.
//
// Downloads the student's released answers PDF WITHOUT signing in, because the
// SMS is read on a phone where they may not be logged in. What keeps it safe:
//  - the code is 6 random base62 characters (lib/mock-sms.ts), minted only
//    for a released attempt, and cleared when the result is unreleased;
//  - it expires after REPORT_CODE_DAYS, then this page points to sign-in;
//  - guessing is rate-limited per IP;
//  - nothing is cached (no-store), and the page is noindex.

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · MockOnline</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:28rem;margin:15vh auto;padding:0 1.25rem;color:#111;line-height:1.5}h1{font-size:1.25rem}a{display:inline-block;margin-top:1rem;background:#2563eb;color:#fff;padding:.6rem 1rem;border-radius:.5rem;text-decoration:none}@media(prefers-color-scheme:dark){body{background:#0b0b0c;color:#eee}}</style></head>
<body><h1>${title}</h1>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const rl = limiter.check(clientIp(req.headers));
  if (!rl.allowed) {
    return new Response("Too many tries. Wait a minute.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds), "Cache-Control": "no-store" },
    });
  }

  const found = await attemptForReportCode(code);
  if (!found.ok) {
    if (found.expired && found.mockId) {
      const next = encodeURIComponent(`/mock/${found.mockId}/result`);
      return page(
        410,
        "This link has expired",
        `<p>Your result is still saved in your account.</p><a href="${EMAIL_BASE_URL}/login?next=${next}">Sign in to see your result</a>`,
      );
    }
    return page(404, "Link not found", "<p>Check the link in your SMS and try again.</p>");
  }

  const built = await buildAttemptReport(found.attemptId, "pdf");
  if (!built) return page(404, "Link not found", "<p>Check the link in your SMS and try again.</p>");

  return new Response(new Uint8Array(built.data), {
    status: 200,
    headers: {
      "Content-Type": built.contentType,
      "Content-Disposition": attachmentDisposition(built.filename),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
