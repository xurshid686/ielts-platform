// Extracts a test's answer key from the CDI test HTML so the platform can grade
// submissions SERVER-SIDE (the client-reported score is no longer trusted).
//
// Every CDI test embeds its key as two JS object literals:
//   const correctAnswers   = { 1:'terminal', 2:'Pantera', ... };
//   const acceptableAnswers = { 6:['raincoat','a raincoat'], ... };
// and reads answers per question via input[name="qN"] (text value, or :checked
// value for MCQ/TF). We parse those literals into a normalised key map and store
// it on the `tests` row at upload time.

export type AnswerKey = Record<string, string[]>;

export type ExtractedKey = {
  key: AnswerKey; // { "1": ["terminal"], "6": ["raincoat","a raincoat"], ... } (lowercased)
  total: number; // number of gradeable questions
};

/** Same normalisation the in-page isCorrect() uses: trim, lowercase, collapse spaces. */
export function normalizeAnswer(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Returns the balanced `{...}` block that follows `<ident> =`, respecting strings
// so braces inside quoted values don't end the block early. null if not found.
function sliceObjectLiteral(src: string, ident: string): string | null {
  const re = new RegExp(`${ident}\\s*=`, "");
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf("{", m.index + m[0].length);
  if (open < 0) return null;

  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = true;
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

// Parses an object-literal body of the shape { key: 'str' | ['str', ...], ... }.
// Keys may be numbers, bare identifiers, or quoted. Tolerant of trailing commas
// and arbitrary whitespace/newlines.
function parseObjectLiteral(body: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const s = body;
  const n = s.length;
  let i = 0;

  const ws = () => {
    while (i < n && /\s/.test(s[i])) i++;
  };
  const readString = (): string => {
    const q = s[i++];
    let r = "";
    while (i < n) {
      const c = s[i++];
      if (c === "\\") r += s[i++] ?? "";
      else if (c === q) break;
      else r += c;
    }
    return r;
  };

  while (i < n && s[i] !== "{") i++;
  i++; // past '{'
  ws();

  while (i < n && s[i] !== "}") {
    ws();
    // --- key ---
    let key = "";
    if (s[i] === "'" || s[i] === '"' || s[i] === "`") key = readString();
    else while (i < n && /[^\s:]/.test(s[i])) key += s[i++];
    ws();
    if (s[i] !== ":") break;
    i++; // past ':'
    ws();

    // --- value: string | array of strings | bare token ---
    let vals: string[] = [];
    if (s[i] === "[") {
      i++; // past '['
      ws();
      while (i < n && s[i] !== "]") {
        ws();
        if (s[i] === "'" || s[i] === '"' || s[i] === "`") vals.push(readString());
        else {
          let v = "";
          while (i < n && /[^\s,\]]/.test(s[i])) v += s[i++];
          if (v) vals.push(v);
        }
        ws();
        if (s[i] === ",") i++;
        ws();
      }
      i++; // past ']'
    } else if (s[i] === "'" || s[i] === '"' || s[i] === "`") {
      vals = [readString()];
    } else {
      let v = "";
      while (i < n && /[^\s,}]/.test(s[i])) v += s[i++];
      if (v) vals = [v];
    }

    const k = key.trim();
    if (k) out[k] = vals;
    ws();
    if (s[i] === ",") i++;
    ws();
  }

  return out;
}

/**
 * Pulls the answer key out of a CDI test's HTML. Merges acceptableAnswers
 * (preferred, holds the variant list) with correctAnswers (fallback / source of
 * the full question set). Returns null if no key could be found.
 */
export function extractAnswerKey(html: string): ExtractedKey | null {
  const correctBody = sliceObjectLiteral(html, "correctAnswers");
  const acceptBody = sliceObjectLiteral(html, "acceptableAnswers");

  // Fallback for the cdi-listening-master format, which stores the whole key as a
  // single `const KEY = { 1:['10','ten'], 11:['a'], 21:['b','d'], ... }` object
  // (each value already a list of accepted, lowercased variants).
  if (!correctBody && !acceptBody) {
    const keyBody = sliceObjectLiteral(html, "\\bKEY");
    if (!keyBody) return null;
    const parsed = parseObjectLiteral(keyBody);
    const key: AnswerKey = {};
    for (const [q, list] of Object.entries(parsed)) {
      const norm = list.map(normalizeAnswer).filter(Boolean);
      if (norm.length) key[q] = Array.from(new Set(norm));
    }
    const total = Object.keys(key).length;
    return total ? { key, total } : null;
  }

  const correct = correctBody ? parseObjectLiteral(correctBody) : {};
  const accept = acceptBody ? parseObjectLiteral(acceptBody) : {};

  // The full question set is the union of both objects' keys.
  const qs = new Set<string>([...Object.keys(correct), ...Object.keys(accept)]);
  const key: AnswerKey = {};
  for (const q of qs) {
    const list =
      accept[q] && accept[q].length ? accept[q] : correct[q] ? correct[q] : [];
    const norm = list.map(normalizeAnswer).filter(Boolean);
    if (norm.length) key[q] = Array.from(new Set(norm));
  }

  const total = Object.keys(key).length;
  if (total === 0) return null;
  return { key, total };
}
