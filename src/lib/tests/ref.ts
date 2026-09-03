/**
 * How a test is addressed in a URL.
 *
 * A test page has two names: its uuid, which every link used until migration
 * 0044, and its slug, which is what the URL should say now:
 *
 *     /reading/3fa98a00-00b3-4255-8739-d8828c872d16   ->  old, still resolves
 *     /reading/the-voynich-manuscript                 ->  canonical
 *
 * BOTH resolve, permanently. Uuid links are in students' Telegram history, in
 * bookmarks, and in the `next=` parameter of every sign-in redirect ever sent;
 * a slug is also free to change if a paper is renamed. Breaking either would
 * break the site for the people already using it, so the uuid form is kept
 * alive and 308s to the canonical one rather than being retired.
 *
 * THIS MODULE MUST STAY CLIENT-SAFE. `test-browser.tsx` is a client component
 * and imports `testPath`, so anything here that reached a Supabase client would
 * drag `server-only` into the browser bundle and fail the build — which is
 * exactly what happened when the redirect lookup lived here. That lookup is in
 * `./canonical.ts`, which is server-only by design.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a URL segment is a uuid rather than a slug. */
export function isUuidRef(ref: string): boolean {
  return UUID.test(ref);
}

/**
 * The canonical path for a test — its slug when it has one, else its uuid.
 *
 * `slug` is nullable in the schema: a row inserted before 0044's trigger, or by
 * a path that bypassed it, has none. Falling back to the uuid keeps that test
 * reachable instead of linking it to a 404.
 */
export function testPath(
  skill: "reading" | "listening",
  t: { id: string; slug?: string | null },
): string {
  return `/${skill}/${t.slug || t.id}`;
}

/**
 * The column filter that matches a URL segment.
 *
 * Kept here rather than inlined at each call site so that "how a ref maps to a
 * row" has exactly one definition. Three places resolve a test from a URL —
 * the reading page, the listening page and the metadata loader — and they must
 * agree, or a page could render for a ref its own `generateMetadata` rejected.
 */
export function refColumn(ref: string): "id" | "slug" {
  return isUuidRef(ref) ? "id" : "slug";
}
