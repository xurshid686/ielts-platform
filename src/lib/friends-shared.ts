// Pure helpers for the Friends plan (0077/0078), shared by server code and tests.

/** A code as people type it: letters and digits only, upper case. */
export function cleanCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 6 && c.length <= 16 ? c : null;
}

/** Monday 00:00 UTC of the current week, as an ISO string (the weekly leaderboard's week). */
export function weekStartIso(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString();
}

// A short word filter for group names shown on the public leaderboard (owner:
// "simple word filter"). Matched on letters only, so "f.u.c.k" is caught too.
// The admin can always rename or hide a group the filter misses.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "pussy", "nigger", "nigga", "whore", "slut", "porn",
  "asshole", "bastard", "faggot", "retard",
  // Uzbek / Russian (latin + cyrillic spellings)
  "jalab", "qanjiq", "skay", "sikay", "onangni", "kotak", "ko'tak", "suka", "blyat", "blyad", "pizda",
  "сука", "блять", "блядь", "пизд", "хуй", "ебат", "жалаб",
];

export type NameCheck = { ok: true; name: string | null } | { ok: false; error: string };

/** Trim, squash spaces, 2–30 characters, no blocked words. Empty = back to the default name. */
export function cleanGroupName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: true, name: null };
  if (name.length < 2 || name.length > 30) return { ok: false, error: "Use 2 to 30 characters." };
  const letters = name.toLowerCase().replace(/[^\p{L}']/gu, "");
  if (BLOCKED.some((w) => letters.includes(w.replace(/[^\p{L}']/gu, "")))) {
    return { ok: false, error: "Please choose a different name." };
  }
  return { ok: true, name };
}
