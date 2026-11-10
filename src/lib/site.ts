// Site-wide constants.

// Premium is granted by an admin (no self-serve checkout). Students request it
// by contacting the admin on Telegram.
export const PREMIUM_TELEGRAM = "AdmniMaterialsUzbot";
export const PREMIUM_TELEGRAM_HANDLE = "@AdmniMaterialsUzbot";
export const PREMIUM_TELEGRAM_URL = "https://t.me/AdmniMaterialsUzbot";

/**
 * What Premium costs. Set by the owner (2026-11-10) and shown on /premium, the
 * lock screen and every "How to get Premium" box, so a price is changed HERE
 * and nowhere else. There is no checkout: a student asks on Telegram, pays the
 * owner directly, and the owner grants the period on /admin/members, whose
 * period list must keep offering every `months` value below.
 */
export const PREMIUM_PLANS: { months: number; label: string; price: string; note?: string }[] = [
  { months: 1, label: "1 month", price: "$2" },
  { months: 3, label: "3 months", price: "$5", note: "Save $1" },
];

/** One line for small spaces: "$2 for 1 month · $5 for 3 months". */
export const PREMIUM_PRICE_LINE = PREMIUM_PLANS.map((p) => `${p.price} for ${p.label}`).join(" · ");

/**
 * The Premium request link for a signed-in student. The `start` payload
 * arrives in the bot as "/start premium_<account id>", so the owner can see
 * WHICH account is asking instead of matching a Telegram name to an email by
 * hand. A uuid without hyphens is 32 characters, inside Telegram's limit of 64.
 */
export function premiumRequestUrl(userId?: string | null): string {
  if (!userId) return PREMIUM_TELEGRAM_URL;
  return `${PREMIUM_TELEGRAM_URL}?start=premium_${userId.replace(/-/g, "")}`;
}

// Support / general contact. A public Telegram account a student can message
// directly — deliberately NOT the premium bot above, which exists to arrange
// paid access.
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
