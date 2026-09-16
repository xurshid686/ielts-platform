// The HTML of every email this platform sends.
//
// IMPORTS NOTHING, on purpose — the same rule discipline-report-text.ts follows:
// the templates are pure string shaping, so they can be unit-tested without a
// server runtime. Branding and absolute URLs are PASSED IN (send.ts fills them
// from lib/site.ts), which is also why there is no relative link anywhere here:
// an email client has no origin to resolve one against.

export type Brand = { name: string; url: string; contactUrl: string };

export type Built = { subject: string; html: string };

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const button = (href: string, label: string) => `
  <a href="${esc(href)}"
     style="display:inline-block;background:#c0572e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600">
    ${esc(label)}
  </a>`;

export function shell(brand: Brand, inner: string, footer?: string): string {
  const host = brand.url.replace(/^https?:\/\//, "");
  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px">
    <div style="background:#c0572e;border-radius:16px 16px 0 0;padding:20px 24px;color:#fff">
      <div style="font-size:18px;font-weight:700">${esc(brand.name)}</div>
      <div style="font-size:13px;opacity:.9">IELTS mock exams</div>
    </div>
    <div style="background:#fff;border:1px solid #e6e9f0;border-top:none;border-radius:0 0 16px 16px;padding:24px;color:#0f172a;line-height:1.55">
      ${inner}
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">
      ${footer ?? `Sent by ${esc(brand.name)} because you sat a mock exam on <a href="${esc(brand.url)}" style="color:#94a3b8">${esc(host)}</a>.`}
      <br />Questions? Message us on <a href="${esc(brand.contactUrl)}" style="color:#94a3b8">Telegram</a>.
    </p>
  </div>`;
}

const firstName = (name?: string | null) => (name?.trim() ? `Hi ${esc(name.trim().split(/\s+/)[0])},` : "Hi,");

export function buildAdminPromotionEmail(brand: Brand, name?: string | null): Built {
  return {
    subject: `You're now an admin on ${brand.name}`,
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${firstName(name)}</p>
      <p style="margin:0 0 16px">
        You've been granted <strong>admin access</strong> on ${esc(brand.name)}.
        You can now upload tests, manage students, and promote other admins.
      </p>
      ${button(`${brand.url}/admin`, "Open the admin panel")}
      <p style="margin:16px 0 0;color:#64748b;font-size:14px">
        If you weren't expecting this, you can ignore this email.
      </p>`,
      `Sent by ${esc(brand.name)}.`,
    ),
  };
}

export type ResultEmailInput = {
  name?: string | null;
  mockTitle: string;
  overall: string;
  bands: { label: string; band: string; sub?: string }[];
  feedback?: string | null;
  resultUrl: string;
  /** Only the sections the student actually sat. */
  reviewUrls: { label: string; url: string }[];
  /** True when the results paper is attached, which changes one sentence. */
  attached?: boolean;
};

const bandRow = (b: { label: string; band: string; sub?: string }) => `
  <tr>
    <td style="padding:6px 0;color:#334155">${esc(b.label)}</td>
    <td style="padding:6px 0;text-align:right;font-weight:700;font-size:16px">${esc(b.band)}</td>
    <td style="padding:6px 0 6px 12px;color:#64748b;font-size:13px">${esc(b.sub ?? "")}</td>
  </tr>`;

/** The released result: bands in the body, the paper attached, links to the papers. */
export function buildMockResultEmail(brand: Brand, input: ResultEmailInput): Built {
  const links = input.reviewUrls
    .map((r) => `<a href="${esc(r.url)}" style="color:#c0572e;font-weight:600;text-decoration:none">${esc(r.label)}</a>`)
    .join(" &nbsp;·&nbsp; ");
  return {
    subject: `Your ${input.mockTitle} result — overall band ${input.overall}`,
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${firstName(input.name)}</p>
      <p style="margin:0 0 16px">
        Your teacher has released your result for <strong>${esc(input.mockTitle)}</strong>.
      </p>
      <div style="border:1px solid #e6e9f0;border-radius:12px;padding:14px 16px;margin:0 0 18px">
        <div style="font-size:13px;color:#64748b">Overall band</div>
        <div style="font-size:34px;font-weight:800;line-height:1.1;color:#c0572e">${esc(input.overall)}</div>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">${input.bands.map(bandRow).join("")}</table>
      </div>
      ${
        input.feedback
          ? `<p style="margin:0 0 6px;font-weight:600">Writing feedback</p>
             <p style="margin:0 0 18px;white-space:pre-wrap;color:#334155">${esc(input.feedback)}</p>`
          : ""
      }
      <p style="margin:0 0 14px">
        ${input.attached ? "Your full results paper is attached to this email. You can also" : "You can"}
        download it again and reopen the papers you sat:
      </p>
      ${button(input.resultUrl, "Open your result")}
      ${links ? `<p style="margin:16px 0 0;font-size:14px">Review your papers: ${links}</p>` : ""}
      <p style="margin:18px 0 0;color:#64748b;font-size:13px">
        You'll need to be signed in with this email address to open the links.
      </p>`,
    ),
  };
}

export type ReceiptEmailInput = {
  name?: string | null;
  mockTitle: string;
  /** Already formatted for the reader (Tashkent time). */
  submittedAt: string;
};

/** The receipt: no scores — nothing is marked yet. */
export function buildMockReceiptEmail(brand: Brand, input: ReceiptEmailInput): Built {
  return {
    subject: `We've received your ${input.mockTitle}`,
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${firstName(input.name)}</p>
      <p style="margin:0 0 16px">
        Your <strong>${esc(input.mockTitle)}</strong> was handed in on ${esc(input.submittedAt)}. All three sections are in.
      </p>
      <p style="margin:0 0 16px">
        Your teacher marks the writing by hand, so your bands are not ready yet. You'll get another email — with your
        results paper attached — as soon as they release it.
      </p>
      ${button(`${brand.url}/mock`, "See your mocks")}`,
    ),
  };
}
