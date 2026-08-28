// Site-wide constants.

// Premium is granted by an admin (no self-serve checkout). Students request it
// by contacting the admin on Telegram.
export const PREMIUM_TELEGRAM = "AdmniMaterialsUzbot";
export const PREMIUM_TELEGRAM_HANDLE = "@AdmniMaterialsUzbot";
export const PREMIUM_TELEGRAM_URL = "https://t.me/AdmniMaterialsUzbot";

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
