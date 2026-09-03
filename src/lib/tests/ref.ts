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

/**
 * Whether the site LINKS by slug yet. Both forms always RESOLVE either way.
 *
 * Off, deliberately, and this is a considered position rather than an unfinished
 * one.
 *
 * On 2026-09-03 mockonline.uz was already indexed and ranking — the owner found
 * `/reading/<uuid>` for "the return of black footed ferret reading" — on a page
 * carrying 106 words and no passage, purely on the strength of its <title>.
 * That changes the arithmetic on renaming those URLs:
 *
 *   - The CONTENT work (passage, key, explanations) adds ~2,300 words to the
 *     SAME url. There is no ranking risk in that direction at all; it is the
 *     page Google already likes, made much better.
 *   - Renaming the url makes Google re-crawl and re-attribute. A 308 handles it
 *     correctly, but there is usually a wobble — and shipping it in the same
 *     release as the content means neither change can be told from the other if
 *     rankings move.
 *
 * A url's keywords are a weak signal; its content is a strong one. So the
 * content ships first and alone, and the rename waits until Search Console can
 * actually measure it.
 *
 * TO TURN SLUG URLS ON: set this to `true`. That is the whole change — links,
 * sitemap, canonical tags and the uuid→slug 308 in `proxy.ts` all key off it.
 * Migrations 0044/0045 are already applied, so no database work is pending.
 */
export const USE_SLUG_URLS = false;

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
  return `/${skill}/${(USE_SLUG_URLS && t.slug) || t.id}`;
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
