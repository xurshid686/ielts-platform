// The HTML of the four reminder emails (migrations 0061 + 0062, owner 2026-11-11).
//
// Pure string shaping, like ./mock-templates.ts: the only import is that
// sibling (itself import-free), so this is unit-tested without a server
// runtime. Branding and absolute URLs are passed in.
//
// Rules the owner set, which these templates must keep:
//  - Every reminder carries an unsubscribe link in its footer.
//  - A Premium email links to the /premium page ONLY, never to Telegram.
//  - Nothing here advertises Speaking.

import { esc, shell, type Brand, type Built } from "./mock-templates";

export type ReminderKind = "streak" | "inactive" | "weekly_report" | "premium_expiring";

const button = (href: string, label: string) => `
  <a href="${esc(href)}"
     style="display:inline-block;background:#c0572e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600">
    ${esc(label)}
  </a>`;

const hello = (name?: string | null) =>
  name?.trim() ? `Hi ${esc(name.trim().split(/\s+/)[0])},` : "Hi,";

/** The footer every reminder shares: why you got it, and the way out. */
export function reminderFooter(brand: Brand, unsubscribeUrl: string): string {
  const host = brand.url.replace(/^https?:\/\//, "");
  return `Sent by ${esc(brand.name)} because you have an account on <a href="${esc(brand.url)}" style="color:#94a3b8">${esc(host)}</a>.
      <br /><a href="${esc(unsubscribeUrl)}" style="color:#94a3b8">Stop reminder emails</a>`;
}

type Common = { name?: string | null; unsubscribeUrl: string };

export function buildStreakEmail(brand: Brand, input: Common & { streak: number }): Built {
  const n = Math.max(1, Math.floor(input.streak));
  return {
    subject: `Keep your ${n}-day streak alive`,
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${hello(input.name)}</p>
      <p style="margin:0 0 16px">
        You're on a <strong>${n}-day streak</strong>, but you haven't practised yet today.
        One test before midnight keeps it going.
      </p>
      ${button(`${brand.url}/reading`, "Take a quick test")}`,
      reminderFooter(brand, input.unsubscribeUrl),
    ),
  };
}

/**
 * The one "we miss you" email, sent when a student has done nothing for 14
 * days (owner, 2026-11-11: no day-1 / day-3 nudges, they were too many).
 * `everPractised` picks the wording: someone coming back, or someone who
 * signed up and never took a test.
 */
export function buildInactiveEmail(brand: Brand, input: Common & { everPractised: boolean }): Built {
  return {
    subject: input.everPractised ? "Two weeks without practice" : "Your first IELTS test is still waiting",
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${hello(input.name)}</p>
      <p style="margin:0 0 16px">
        ${
          input.everPractised
            ? `It has been two weeks since your last test on ${esc(brand.name)}. One reading passage takes about 20 minutes and gets you moving again. Your results and progress are exactly where you left them.`
            : `You joined ${esc(brand.name)} two weeks ago and haven't taken a test yet. One reading passage takes about 20 minutes, in the real computer-delivered exam interface, and it tells you your band the moment you submit.`
        }
      </p>
      ${button(`${brand.url}/dashboard`, input.everPractised ? "Take a test" : "Start your first test")}
      <p style="margin:16px 0 0;color:#64748b;font-size:14px">We won't send this again while you stay away.</p>`,
      reminderFooter(brand, input.unsubscribeUrl),
    ),
  };
}

const stat = (label: string, value: string) => `
  <td style="padding:10px 8px;background:#f8fafc;border:1px solid #e6e9f0;border-radius:10px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#0f172a">${esc(value)}</div>
    <div style="font-size:12px;color:#64748b">${esc(label)}</div>
  </td>`;

const band = (n: number | null | undefined) => (n != null && Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "—");

export function buildWeeklyReportEmail(
  brand: Brand,
  input: Common & {
    tests: number;
    avgBand: number | null;
    bestBand: number | null;
    ratingDelta: number | null;
    reportUrl: string;
  },
): Built {
  const delta = input.ratingDelta ?? 0;
  const deltaLine =
    delta > 0
      ? `Your reading rating went up by <strong>${delta}</strong> this week.`
      : delta < 0
        ? `Your reading rating moved by <strong>${delta}</strong> this week.`
        : "";
  return {
    subject: `Your week: ${input.tests} ${input.tests === 1 ? "test" : "tests"}, average band ${band(input.avgBand)}`,
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${hello(input.name)}</p>
      <p style="margin:0 0 16px">Here is how your week went:</p>
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 18px">
        <tr>
          ${stat("Tests", String(input.tests))}
          ${stat("Average band", band(input.avgBand))}
          ${stat("Best band", band(input.bestBand))}
        </tr>
      </table>
      ${deltaLine ? `<p style="margin:0 0 16px">${deltaLine}</p>` : ""}
      ${button(input.reportUrl, "Open your weekly report")}`,
      reminderFooter(brand, input.unsubscribeUrl),
    ),
  };
}

/** `before`: Premium ends in 3 days. `after`: it ended yesterday. `endsOn` is already formatted. */
export function buildPremiumExpiringEmail(
  brand: Brand,
  input: Common & { stage: "before" | "after"; endsOn: string; priceLine: string },
): Built {
  const before = input.stage === "before";
  return {
    subject: before ? "Your Premium ends in 3 days" : "Your Premium has ended",
    html: shell(
      brand,
      `
      <p style="margin:0 0 12px">${hello(input.name)}</p>
      <p style="margin:0 0 16px">
        ${
          before
            ? `Your Premium membership ends on <strong>${esc(input.endsOn)}</strong>. Renew before then and nothing changes: every Premium test stays open.`
            : `Your Premium membership ended on <strong>${esc(input.endsOn)}</strong>, so the Premium tests are locked again. Your results and progress are all still there.`
        }
      </p>
      <p style="margin:0 0 16px;color:#334155">${esc(input.priceLine)}</p>
      ${button(`${brand.url}/premium`, before ? "Renew Premium" : "Get Premium back")}`,
      reminderFooter(brand, input.unsubscribeUrl),
    ),
  };
}
