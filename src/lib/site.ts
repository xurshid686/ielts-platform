// Site-wide constants.

// Premium is granted by an admin (no self-serve checkout). Students request it
// by writing to the owner's own Telegram ADMIN ACCOUNT (owner, 2026-11-10). It
// is a person, not a bot: it used to be @AdmniMaterialsUzbot.
export const PREMIUM_TELEGRAM = "ListeningReadingTests";
export const PREMIUM_TELEGRAM_HANDLE = "@ListeningReadingTests";
export const PREMIUM_TELEGRAM_URL = "https://t.me/ListeningReadingTests";

/**
 * What Premium costs. Set by the owner (2026-11-10) and shown on /premium, the
 * lock screen and every "How to get Premium" box, so a price is changed HERE
 * and nowhere else. There is no checkout: a student asks on Telegram, pays the
 * owner directly, and the owner grants the period on /admin/members, whose
 * period list must keep offering every `months` value below.
 */
export type Plan = {
  months: number;
  label: string;
  /** The price shown everywhere: so'm (owner, 2026-11-24: one currency across plans). */
  price: string;
  /** What Payme/Click charge, in so'm. The server's own number, never the browser's. */
  priceUzs: number;
  /** A small "≈ $2" hint for visitors thinking in dollars. */
  usd: string;
  note?: string;
};

export const PREMIUM_PLANS: Plan[] = [
  { months: 1, label: "1 month", price: formatUzs(25_000), priceUzs: 25_000, usd: "$2" },
  { months: 3, label: "3 months", price: formatUzs(60_000), priceUzs: 60_000, usd: "$5", note: `Save ${formatUzs(15_000)}` },
];

/** "25 000 so'm": a no-break space between thousands, the Uzbek way. */
export function formatUzs(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")} so'm`;
}

/** One line for small spaces: "25 000 so'm for 1 month · 60 000 so'm for 3 months". */
export const PREMIUM_PRICE_LINE = PREMIUM_PLANS.map((p) => `${p.price} for ${p.label}`).join(" · ");

/**
 * The Premium request link. It opens the admin's chat with a message already
 * typed, naming the period and the student's account, so the owner can find
 * the account on /admin/members (which searches by email) without asking.
 *
 * `?text=` is what works for a PERSON's username. A bot's `?start=` payload
 * would be ignored here, which is why this is not a deep link any more.
 * The student sees the draft and sends it themselves; nothing is sent for them.
 */
export function premiumRequestUrl(account?: string | null, months?: number): string {
  const plan = PREMIUM_PLANS.find((p) => p.months === months);
  const lines = [
    plan
      ? `Hello! I would like ${SITE_NAME} Premium for ${plan.label} (${plan.price}).`
      : `Hello! I would like ${SITE_NAME} Premium.`,
  ];
  if (account) lines.push(`My account: ${account}`);
  return `${PREMIUM_TELEGRAM_URL}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/**
 * Ultima: the teachers' plan (2026-11-20). It INCLUDES Premium plus a PDF of every reading test and
 * its answers, sent by the teacher bot. Sold exactly like Premium: the student messages the owner on
 * Telegram, pays, and the owner grants it on /admin/members (which also extends Premium by the same
 * period). Prices are set by the owner and live here only.
 */
export const ULTIMA_PLANS: Plan[] = [
  { months: 1, label: "1 month", price: formatUzs(50_000), priceUzs: 50_000, usd: "$4" },
  { months: 3, label: "3 months", price: formatUzs(120_000), priceUzs: 120_000, usd: "$10", note: `Save ${formatUzs(30_000)}` },
];

/** One line for small spaces: "50 000 so'm for 1 month · 120 000 so'm for 3 months". */
export const ULTIMA_PRICE_LINE = ULTIMA_PLANS.map((p) => `${p.price} for ${p.label}`).join(" · ");

/** The Ultima request link: the owner's chat with a message already typed (see premiumRequestUrl). */
export function ultimaRequestUrl(account?: string | null, months?: number): string {
  const plan = ULTIMA_PLANS.find((p) => p.months === months);
  const lines = [
    plan
      ? `Hello! I would like ${SITE_NAME} Ultima (includes Premium) for ${plan.label} (${plan.price}).`
      : `Hello! I would like ${SITE_NAME} Ultima (includes Premium).`,
  ];
  if (account) lines.push(`My account: ${account}`);
  return `${PREMIUM_TELEGRAM_URL}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/**
 * Friends (owner, 2026-11-27, after chess.com's "Friends & Family"): one organiser
 * buys Premium for a group of up to FRIENDS_SEATS people, the organiser included.
 * Friends join with an invite link (/join/<code>) and get Premium until the
 * group's end date (0077). 3 months is the owner's price; 1 month is mine, the
 * same ~35% per-person saving. Prices live here only.
 */
export const FRIENDS_SEATS = 4;
export const FRIENDS_PLANS: Plan[] = [
  { months: 1, label: "1 month", price: formatUzs(65_000), priceUzs: 65_000, usd: "$5" },
  { months: 3, label: "3 months", price: formatUzs(150_000), priceUzs: 150_000, usd: "$12", note: `Save ${formatUzs(45_000)}` },
];

/** What one seat costs: "37 500 so'm per person". */
export function perPerson(plan: Plan): string {
  return formatUzs(Math.round(plan.priceUzs / FRIENDS_SEATS / 500) * 500);
}

/** The Friends request link: the owner's chat with a message already typed (see premiumRequestUrl). */
export function friendsRequestUrl(account?: string | null, months?: number): string {
  const plan = FRIENDS_PLANS.find((p) => p.months === months);
  const lines = [
    plan
      ? `Hello! I would like ${SITE_NAME} Friends (Premium for ${FRIENDS_SEATS} people) for ${plan.label} (${plan.price}).`
      : `Hello! I would like ${SITE_NAME} Friends (Premium for ${FRIENDS_SEATS} people).`,
  ];
  if (account) lines.push(`My account: ${account}`);
  return `${PREMIUM_TELEGRAM_URL}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/**
 * The periods the owner can grant on /admin/members, for Premium AND Ultima. Every `months` value
 * sold above (PREMIUM_PLANS, ULTIMA_PLANS) must appear here: site.test.ts enforces it.
 */
export const GRANT_PERIODS: { months: number; label: string }[] = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
];

// Support / general contact: the same admin account that arranges Premium.
export const CONTACT_TELEGRAM = "ListeningReadingTests";
export const CONTACT_TELEGRAM_HANDLE = "@ListeningReadingTests";
export const CONTACT_TELEGRAM_URL = "https://t.me/ListeningReadingTests";

// The one canonical public address. Every absolute URL the site emits —
// canonical tags, the sitemap, OpenGraph — is built from this.
//
// Four hosts serve this app (mockonline.uz, the DigitalOcean hostname and two
// Vercel URLs). Without a single canonical base, Google splits ranking signals
// across all four and may pick the wrong one. This names the winner; proxy.ts
// sends `X-Robots-Tag: noindex` from the others.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://mockonline.uz"
).replace(/\/+$/, "");

// The host part of SITE_URL, for comparing against an incoming request's Host.
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

// Shown as the brand in titles and structured data.
export const SITE_NAME = "MockOnline";
