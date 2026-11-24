// Pure helpers for the "Edit profile" name fields (owner, 2026-11-24).
// Imports NOTHING, so it is unit-testable without the @/ alias.

export const NAME_PART_MIN = 2;
export const NAME_PART_MAX = 30;

// Letters in any script (Latin, Cyrillic, Uzbek), single spaces, hyphens and
// the apostrophes Uzbek uses for oʻ / gʻ and for ʼ (plus the ASCII and curly ones).
const ALLOWED = /^[\p{L}\p{M}](?:[\p{L}\p{M} \-ʻʼ'’]*[\p{L}\p{M}ʻʼ'’])?$/u;

function retitle(s: string): string {
  // Only when the student typed everything in one case ("ali", "ALI").
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (!letters) return s;
  const allLower = letters === letters.toLocaleLowerCase();
  const allUpper = letters === letters.toLocaleUpperCase();
  if (!allLower && !allUpper) return s;
  return s
    .toLocaleLowerCase()
    .replace(/(^|[ \-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
}

export type NamePartResult = { ok: true; value: string } | { ok: false; error: string };

export function cleanNamePart(raw: string, label: string): NamePartResult {
  const s = (raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const len = [...s].length;
  if (len < NAME_PART_MIN) return { ok: false, error: `${label} needs at least ${NAME_PART_MIN} letters.` };
  if (len > NAME_PART_MAX) return { ok: false, error: `${label} can be at most ${NAME_PART_MAX} characters.` };
  if (!ALLOWED.test(s)) return { ok: false, error: `${label} can only contain letters, spaces, hyphens and apostrophes.` };
  return { ok: true, value: retitle(s) };
}

export type PersonNameResult = { ok: true; name: string } | { ok: false; error: string };

/** First name + surname -> the single `profiles.name` value ("First Surname"). */
export function cleanPersonName(first: string, last: string): PersonNameResult {
  const f = cleanNamePart(first, "First name");
  if (!f.ok) return f;
  const l = cleanNamePart(last, "Surname");
  if (!l.ok) return l;
  return { ok: true, name: `${f.value} ${l.value}` };
}

/** Pre-fill: split a stored name on the FIRST space. */
export function splitName(name: string | null | undefined): { first: string; last: string } {
  const s = (name ?? "").trim().replace(/\s+/g, " ");
  const i = s.indexOf(" ");
  return i === -1 ? { first: s, last: "" } : { first: s.slice(0, i), last: s.slice(i + 1) };
}

/** Is this the WebP the browser's canvas produced? ("RIFF" .... "WEBP") */
export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}

/** JPEG starts FF D8 FF. Safari's canvas cannot encode WebP, so it sends JPEG. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** The only two photo types the avatar store accepts, read from the bytes. */
export function sniffPhotoType(bytes: Uint8Array): "image/webp" | "image/jpeg" | null {
  return isWebp(bytes) ? "image/webp" : isJpeg(bytes) ? "image/jpeg" : null;
}
