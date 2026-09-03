import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTrack } from "@/lib/levels";
import { getCachedTestHtml, setCachedTestHtml } from "@/lib/tests/html-cache";
import { downloadTestHtml } from "@/lib/tests/access";
import { extractSeoContent, EMPTY_SEO_CONTENT, type TestSeoContent } from "./test-content";

/**
 * Loads the indexable body of a test page.
 *
 * This is the ONLY place that decides what a logged-out visitor — and therefore
 * Googlebot — may read of a test. `extractSeoContent` just parses; the gate is
 * here, and it is deliberately narrow:
 *
 *   1. regular track only  — pre_ielts / intro material 404s for everyone else,
 *                            so publishing it would leak pages nobody can open.
 *   2. `PUBLISHED_TIERS`   — see below.
 *
 * Read with the service-role client because this runs with no user session and
 * `answer_key` is revoked from the client roles (migration 0034). Nothing it
 * returns is rendered without passing the gate above.
 */

/**
 * Which tiers publish their passage, answers and explanations to the open web.
 *
 * Every test in the library is `free` today, so this changes nothing now — it
 * exists so that adding the first premium test does not silently publish the
 * paid product. Narrowing this to `["free"]` is the one-line way to stop
 * publishing premium material if that ever ships.
 *
 * Publishing this content is a deliberate trade the owner made: the passage,
 * key and explanations are what students actually search for ("<name> ielts
 * reading answers"), and a page that does not contain them cannot rank for
 * them. The timed exam interface, auto-marking, band score and progress
 * tracking stay behind an account.
 */
const PUBLISHED_TIERS = new Set(["free", "premium"]);

export type TestSeoData = TestSeoContent & {
  /** `{ "27": ["true"] }` — the stored key, or `{}` when the row has none. */
  answerKey: Record<string, string[]>;
};

const EMPTY: TestSeoData = { ...EMPTY_SEO_CONTENT, answerKey: {} };

/**
 * Parsed content keyed by storage path.
 *
 * `html-cache` already memoises the DOWNLOAD; this memoises the PARSE, which is
 * the expensive half for a 550 KB full test. The key is safe for the same
 * reason it is safe there: `uploadTest` writes every upload to a fresh
 * `${skill}/${randomUUID()}.html`, so a re-upload produces a new path and can
 * never collide with a cached entry.
 *
 * Only non-sensitive, already-public-by-decision content is held here. The
 * answer key is NOT cached — it is read fresh from the row each time, so this
 * cache can never become a place the key is resident.
 */
const parsed = new Map<string, { content: TestSeoContent; expiresAt: number }>();
const PARSE_TTL_MS = 15 * 60 * 1000;
const PARSE_MAX_ENTRIES = 64;

function getParsed(filePath: string): TestSeoContent | null {
  const hit = parsed.get(filePath);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    parsed.delete(filePath);
    return null;
  }
  // Refresh recency — Map iteration order gives LRU eviction for free.
  parsed.delete(filePath);
  parsed.set(filePath, hit);
  return hit.content;
}

function setParsed(filePath: string, content: TestSeoContent): void {
  parsed.delete(filePath);
  parsed.set(filePath, { content, expiresAt: Date.now() + PARSE_TTL_MS });
  while (parsed.size > PARSE_MAX_ENTRIES) {
    const oldest = parsed.keys().next();
    if (oldest.done) break;
    parsed.delete(oldest.value);
  }
}

/** Test seam — lets a unit test start from a known empty cache. */
export function clearSeoContentCache(): void {
  parsed.clear();
}

/**
 * Never throws and never rejects. A test whose file has gone missing, or whose
 * markup this cannot read, renders the page it rendered before — losing a
 * section is a regression, but a 500 on a URL Google is actively crawling is an
 * outage on the pages the whole exercise exists to get indexed.
 */
export async function loadTestSeoData(
  id: string,
  skill: "reading" | "listening",
): Promise<TestSeoData> {
  try {
    const { data } = await createAdminClient()
      .from("tests")
      .select("file_path, tier, track, answer_key")
      .eq("id", id)
      .eq("skill", skill)
      .single();

    const row = data as {
      file_path: string | null;
      tier: string | null;
      track: string | null;
      answer_key: Record<string, string[]> | null;
    } | null;

    if (!row?.file_path) return EMPTY;
    if (!PUBLISHED_TIERS.has(row.tier ?? "free")) return EMPTY;
    if (!canAccessTrack({ role: "student", level: "regular" }, row.track ?? "regular")) {
      return EMPTY;
    }

    const cached = getParsed(row.file_path);
    if (cached) return { ...cached, answerKey: row.answer_key ?? {} };

    let html = getCachedTestHtml(row.file_path);
    if (html === null) {
      html = await downloadTestHtml(row.file_path);
      if (html === null) return EMPTY;
      setCachedTestHtml(row.file_path, html);
    }

    const content = extractSeoContent(html);
    setParsed(row.file_path, content);
    return { ...content, answerKey: row.answer_key ?? {} };
  } catch (e) {
    console.error(`[seo] could not build public content for ${skill}/${id}:`, e);
    return EMPTY;
  }
}

/**
 * Question numbers in the order a paper presents them.
 *
 * Numeric, not lexicographic: `Object.keys` on a key covering questions 27–40
 * sorts "10" before "9", which printed the answer list out of order on every
 * full test.
 */
export function questionOrder(answerKey: Record<string, unknown>): string[] {
  return Object.keys(answerKey).sort((a, b) => Number(a) - Number(b));
}

/**
 * How an answer is shown in the public list.
 *
 * The stored key is lower-cased for marking (`["not given"]`), which is not how
 * a paper prints it. Letters and TRUE/FALSE/NOT GIVEN are upper-cased back;
 * a gap-fill word is left alone apart from its first letter, because
 * upper-casing "spectral analysis" would misrepresent the answer.
 *
 * Variants are joined with "/" — a key of `["car park", "carpark"]` means both
 * are accepted, and hiding that would teach the student the wrong thing.
 */
export function formatAnswer(value: string[] | undefined): string {
  if (!value?.length) return "—";
  return value
    .map((v) => {
      const s = v.trim();
      if (!s) return s;
      if (/^(?:true|false|not given|yes|no)$/i.test(s)) return s.toUpperCase();
      if (/^[a-z]$/i.test(s)) return s.toUpperCase();
      return s.charAt(0).toUpperCase() + s.slice(1);
    })
    .join(" / ");
}
