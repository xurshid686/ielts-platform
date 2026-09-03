/**
 * Pulls the indexable half of a CDI test file out of the stored HTML.
 *
 * WHY THIS EXISTS
 * ---------------
 * A test page used to render 103 words: the title, the format badges and a
 * "Start test" button. Everything a student actually searches for — the passage
 * itself, the answers, the explanations — lived inside `/api/test-html`, which
 * is entitlement-gated, `no-store` and `Disallow`ed in robots.txt. So the page
 * matched "<name>" and nothing else, and never "<name> ielts reading answers",
 * which is the highest-volume way students phrase that search.
 *
 * This module reads the same stored file the runner serves and lifts out the
 * three uniform pieces:
 *
 *   - `#passageContent`   the passage body (every CDI reading build has it)
 *   - `explanations = {}` the per-question answer / evidence / reasoning
 *   - the passage `<h1>`  the name the file itself gives the passage
 *
 * Per-question TEXT is deliberately not extracted. Its markup differs for each
 * of the 11+ question types (`tfng-statement-text`, `summary-line`,
 * `statement-cell`, …) and a partial extraction that silently drops half the
 * questions is worse than none. The explanations carry the same substance in a
 * shape that is identical across every build.
 *
 * NOTHING HERE DECIDES WHO MAY SEE THIS. The caller does — see
 * `seoContentForTest` in `test-detail.tsx`. This module only parses.
 */

/** One body of prose from the file: a reading passage, or a listening transcript. */
export type SeoPassage = {
  /** The name the file's own heading gives it, when it carries one. */
  title: string | null;
  /** Sanitized markup, safe to render. */
  html: string;
  /** Visible words — a full test's three passages are counted separately. */
  wordCount: number;
};

/** One question's worked answer, as the CDI file records it. */
export type SeoExplanation = {
  /** The correct answer as the file spells it ("TRUE", "D", "microscope"). */
  answer?: string;
  /** The quoted passage text that proves it. */
  evidence?: string;
  /** Why the other options are wrong. */
  why?: string;
};

export type TestSeoContent = {
  /**
   * In document order. A single reading test has one; a full test has three;
   * a listening test has its transcript. Empty when the file has no prose this
   * module recognises.
   */
  passages: SeoPassage[];
  /** Visible words across all of them — the page uses it to decide what to render. */
  wordCount: number;
  /** Keyed by question number as a string: `{ "27": { answer, evidence, why } }`. */
  explanations: Record<string, SeoExplanation>;
};

export const EMPTY_SEO_CONTENT: TestSeoContent = {
  passages: [],
  wordCount: 0,
  explanations: {},
};

/* -------------------------------------------------------------------------- */
/* Passage                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Tags kept in the rendered passage. Everything else has its tags dropped and
 * its text kept, so an unexpected wrapper degrades to plain prose rather than
 * to a hole in the page.
 *
 * `h1` and `h2` are NOT here. The page owns the outline down to `<h3>`, and a
 * passage that emitted its own `<h1>` would leave the page with two — a
 * structural error on the very pages this exists to get ranked.
 * `normalizeHeadings` rewrites every heading into range before this applies.
 */
const ALLOWED_TAGS = new Set([
  "p",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "sup",
  "sub",
  "br",
  "ul",
  "ol",
  "li",
  "blockquote",
]);

/**
 * How a prose block names itself, which decides whether its leading heading is
 * a title to lift or content to keep. See `sliceProseBlocks`.
 */
type ProseKind = "passage" | "transcript";

/**
 * The library is not one shape. Across 186 stored files there are four:
 *
 *   reading, single passage   `id="passageContent"`
 *   reading, full test (A)    `id="passageContent-p1"`, `-p2`, `-p3`
 *   reading, full test (B)    `class="passage-content"` ×3, no ids at all
 *   listening                 `id="scriptText"`  (the transcript)
 *
 * The first cut matched only the bare `passageContent` id and produced an empty
 * section for every full test and every listening test — 34 of 186. Shape (B)
 * is why this checks classes as well as ids: those three files carry no usable
 * id anywhere in the passage tree.
 */
function proseKindOf(tag: string): ProseKind | null {
  const id = /\bid=["']([^"']+)["']/i.exec(tag)?.[1];
  if (id) {
    if (/^passageContent(?:-p\d+)?$/.test(id)) return "passage";
    if (id === "scriptText") return "transcript";
  }
  const cls = /\bclass=["']([^"']+)["']/i.exec(tag)?.[1];
  if (cls && cls.split(/\s+/).includes("passage-content")) return "passage";
  return null;
}

/**
 * Every prose container's innerHTML, in document order.
 *
 * One pass over the opening tags, not one pass per selector: two scans could
 * both claim the same element and emit the passage twice. Depth-counted rather
 * than regex-matched to the first `</div>`, because a passage contains nested
 * divs (figures, paragraph-letter rails) that a lazy match would truncate at.
 */
function sliceProseBlocks(html: string): { html: string; kind: ProseKind }[] {
  const out: { html: string; kind: ProseKind }[] = [];
  const opener = /<(div|section)\b[^>]*>/gi;

  for (let m = opener.exec(html); m; m = opener.exec(html)) {
    const kind = proseKindOf(m[0]);
    if (!kind) continue;

    const start = m.index + m[0].length;
    let depth = 1;
    const tag = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, "gi");
    tag.lastIndex = start;

    let end = html.length;
    for (let hit = tag.exec(html); hit; hit = tag.exec(html)) {
      depth += hit[1] ? -1 : 1;
      if (depth === 0) {
        end = hit.index;
        break;
      }
    }
    out.push({ html: html.slice(start, end), kind });

    // Never rescan inside a block we just took — a nested prose container would
    // otherwise be emitted a second time, inside its own parent.
    opener.lastIndex = end;
  }
  return out;
}

/**
 * Flattens every heading left inside a block to one level.
 *
 * The page owns the outline above this point: `<h2>` is the section ("Reading
 * passages"), `<h3>` is a passage's own name. So whatever a stored file used
 * internally — the shapes disagree, some `<h2>`, some `<h3>` — has to land
 * BELOW that, and consistently.
 *
 * `level` is `h4` for a passage, whose name already occupies the `<h3>`, and
 * `h3` for a transcript, which has no name of its own and would otherwise jump
 * straight from `<h2>` to `<h4>`.
 */
function normalizeHeadings(fragment: string, level: "h3" | "h4"): string {
  return fragment.replace(/<(\/?)h[1-6]\b[^>]*>/gi, `<$1${level}>`);
}

/**
 * Strips the fragment to `ALLOWED_TAGS` with every attribute removed.
 *
 * Attributes go because the CDI file's `id="para-7"` / `class="…"` hooks belong
 * to the test runner, and re-emitting them into the marketing page would
 * collide with its own styles and with the runner when a guest starts the test
 * in place. Removing them also removes any handler or `style` an upload could
 * carry, which is what makes the result safe for `dangerouslySetInnerHTML`.
 */
function sanitizeFragment(fragment: string): string {
  return (
    fragment
      // Whole elements whose CONTENT must go too, not just their tags.
      //
      // The controls matter as much as the scripts: a passage pane carries the
      // runner's own buttons ("Highlight", "Notes"), and merely stripping their
      // tags left the label text sitting in the prose as though the passage had
      // said it. Worse, a container holding nothing BUT a control then counted
      // as prose and rendered as an empty passage section.
      .replace(
        /<(script|style|button|select|textarea|svg|form|nav|template)\b[\s\S]*?<\/\1\s*>/gi,
        "",
      )
      .replace(/<(input|img|source|track)\b[^>]*>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_all, close: string, name: string) => {
        const tag = name.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) return "";
        return tag === "br" ? "<br />" : `<${close}${tag}>`;
      })
      // Collapse the whitespace the stripped wrappers left behind.
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Visible text of a markup fragment, entities resolved, whitespace collapsed. */
export function fragmentToText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The handful of named entities the CDI files actually use, plus numeric ones.
 *
 * A full entity table is not worth carrying: this runs on our own generated
 * files, and anything unlisted is left as-is (harmless in text, since the only
 * consumers are a word count and the meta description).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  deg: "°",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : all;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? all;
  });
}

/* -------------------------------------------------------------------------- */
/* Explanations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Index of the `{` opening `<ident> = { … }`, and of the `}` that closes it.
 *
 * Deliberately the same shape as `sanitize-test-html.ts`: the identifier must
 * not be part of a longer name or a property access. The two must agree about
 * what a "sensitive literal" is — the sanitizer blanks these on the way to the
 * browser, and this reads them on the way to the page.
 */
function literalRange(src: string, ident: string): [number, number] | null {
  const re = new RegExp(`(?:^|[^\\w$.])${ident}\\s*=\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;

  const open = src.indexOf("{", m.index);
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
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return [open, i + 1];
  }
  return null;
}

/** `"…"` / `'…'` string literal starting at `from`, with escapes resolved. */
function readString(src: string, from: number): { value: string; end: number } | null {
  const quote = src[from];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;

  let out = "";
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      if (n === "u") {
        // \uXXXX — consume the four hex digits and emit the character.
        const code = Number.parseInt(src.slice(i + 2, i + 6), 16);
        if (Number.isFinite(code)) out += String.fromCodePoint(code);
        i += 5;
        continue;
      }
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "" : (n ?? "");
      i++;
      continue;
    }
    if (c === quote) return { value: out, end: i + 1 };
    out += c;
  }
  return null;
}

/**
 * Parses `explanations = { 27: { answer: "…", evidence: "…", why: "…" }, … }`.
 *
 * Hand-written rather than `JSON.parse` because this is a JS object literal,
 * not JSON: the keys are bare numbers and the values may use single quotes or
 * trailing commas. `eval` is obviously out — the file is uploaded content.
 *
 * Anything that does not parse is skipped, never thrown. A malformed
 * explanations block must cost us a section of a marketing page, not the page.
 */
export function parseExplanations(html: string): Record<string, SeoExplanation> {
  const range = literalRange(html, "explanations");
  if (!range) return {};

  const body = html.slice(range[0] + 1, range[1] - 1);
  const out: Record<string, SeoExplanation> = {};

  // Each entry: <number or "number"> : { … }
  const entry = /(?:^|,)\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*:\s*\{/g;
  for (let m = entry.exec(body); m; m = entry.exec(body)) {
    const q = m[1] ?? m[2] ?? m[3];

    // `literalRange` keys off an identifier and there is none here, so walk the
    // braces directly from the `{` this entry opened.
    const open = body.indexOf("{", m.index);
    let depth = 0;
    let inStr = false;
    let quote = "";
    let esc = false;
    let close = -1;
    for (let i = open; i < body.length; i++) {
      const c = body[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inStr = true;
        quote = c;
      } else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        close = i;
        break;
      }
    }
    if (close < 0) continue;

    const fields = body.slice(open + 1, close);
    const exp: SeoExplanation = {};
    const prop = /(?:^|,)\s*(?:"([a-zA-Z_]\w*)"|'([a-zA-Z_]\w*)'|([a-zA-Z_]\w*))\s*:\s*/g;
    for (let p = prop.exec(fields); p; p = prop.exec(fields)) {
      const key = (p[1] ?? p[2] ?? p[3]).toLowerCase();
      const str = readString(fields, p.index + p[0].length);
      if (!str) continue;
      const value = decodeEntities(str.value).replace(/\s+/g, " ").trim();
      if (key === "answer") exp.answer = value;
      else if (key === "evidence") exp.evidence = value;
      else if (key === "why" || key === "reason") exp.why = value;
      prop.lastIndex = str.end;
    }

    if (exp.answer || exp.evidence || exp.why) out[q] = exp;
    entry.lastIndex = close;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything indexable in one stored test file.
 *
 * Never throws: a file this cannot read yields `EMPTY_SEO_CONTENT` and the page
 * falls back to the card it rendered before. Losing the SEO section is a
 * regression; a 500 on a public URL Google is crawling is an outage.
 */
export function extractSeoContent(html: string): TestSeoContent {
  try {
    const explanations = parseExplanations(html);

    const passages: SeoPassage[] = [];
    for (const block of sliceProseBlocks(html)) {
      const raw = block.html;

      // A reading passage opens with its own name — <h1> in one shape, <h2> in
      // another — and that heading is lifted out: the page renders it as the
      // section heading, and a passage that repeated its own title inside its
      // body would read as a duplicate to both a student and a crawler.
      //
      // A TRANSCRIPT's headings are "Part 1" … "Part 4": structure, not a name.
      // Lifting the first one invented a passage called "Part 1" and deleted a
      // real divider from the transcript, so transcripts keep every heading.
      const head =
        block.kind === "passage"
          ? /^\s*(?:<[^>]+>\s*)*?<h([12])[^>]*>([\s\S]*?)<\/h\1\s*>/i.exec(raw)
          : null;
      const title = head ? fragmentToText(head[2]) || null : null;
      const body = head
        ? raw.slice(0, head.index) + raw.slice(head.index + head[0].length)
        : raw;

      const fragment = sanitizeFragment(normalizeHeadings(body, title ? "h4" : "h3"));
      const wordCount = fragment
        ? fragmentToText(fragment).split(/\s+/).filter(Boolean).length
        : 0;

      // A container that held only controls is not prose. Skipping it keeps an
      // empty "Reading passage" heading off the page.
      if (wordCount > 0) passages.push({ title, html: fragment, wordCount });
    }

    return {
      passages,
      wordCount: passages.reduce((n, p) => n + p.wordCount, 0),
      explanations,
    };
  } catch {
    return EMPTY_SEO_CONTENT;
  }
}
