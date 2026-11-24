// Pure helpers for the result SMS (0071). No imports, so they run in the
// browser (the phone input), on the server, and in the unit tests.

/** Uzbek country code. Every stored number starts with it. */
export const UZ_PREFIX = "998";

/**
 * Any way a student might type an Uzbek mobile → "998XXXXXXXXX", or null if it
 * isn't one. Accepts "+998 90 123-45-67", "998901234567" and the bare 9 digits.
 */
export function normalizeUzPhone(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith(UZ_PREFIX) ? digits.slice(3) : digits;
  return /^[0-9]{9}$/.test(local) ? UZ_PREFIX + local : null;
}

/**
 * What the student types after the fixed "+998": up to 9 digits. A pasted
 * "+998…" / "998…" loses its prefix so it isn't doubled.
 */
export function localUzDigits(input: string | null | undefined): string {
  let digits = (input ?? "").replace(/\D/g, "");
  if (digits.length > 9 && digits.startsWith(UZ_PREFIX)) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** "901234567" → "90 123 45 67" (as typed, partial is fine). */
export function spaceUzLocal(local: string): string {
  const d = local.replace(/\D/g, "").slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}

/** "998901234567" → "+998 90 123 45 67". */
export function formatUzPhone(stored: string | null | undefined): string {
  const n = normalizeUzPhone(stored);
  return n ? `+998 ${spaceUzLocal(n.slice(3))}` : "";
}

export type ResultSmsInput = {
  overall: number;
  listening?: number | null;
  reading?: number | null;
  writing?: number | null;
  url: string;
};

const band = (n: number) => Number(n).toFixed(1);

/** The SMS body. Sections the mock didn't have are left out. */
export function buildResultSms(r: ResultSmsInput): string {
  const lines = ["MockOnline: Thank you for taking a mock with us!", "", `Overall: ${band(r.overall)}`];
  if (r.listening != null) lines.push(`Listening: ${band(r.listening)}`);
  if (r.reading != null) lines.push(`Reading: ${band(r.reading)}`);
  if (r.writing != null) lines.push(`Writing: ${band(r.writing)}`);
  lines.push("", `Download your answers: ${r.url}`);
  return lines.join("\n");
}

// GSM 03.38 basic set (no escapes). Anything outside it turns the SMS into
// UCS-2 and the segment drops from 160 to 70 characters.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!GSM7.includes(ch)) return false;
  return true;
}

/** True when the text costs exactly one SMS. */
export function isSingleGsmSegment(text: string): boolean {
  return isGsm7(text) && text.length <= 160;
}
