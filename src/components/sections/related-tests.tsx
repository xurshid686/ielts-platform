import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTrack } from "@/lib/levels";
import { testPath } from "@/lib/tests/ref";

/** How many siblings each test page links to. See `loadRelated`. */
const RELATED_COUNT = 12;

type RelatedRow = {
  id: string;
  slug: string | null;
  title: string;
  total: number | null;
  question_types: string[] | null;
};

/**
 * Other tests in the same skill, linked from the bottom of a test page.
 *
 * This is internal linking, and on this site it is not cosmetic. Every one of
 * the ~190 test pages is reachable from exactly ONE place — the `/reading` or
 * `/listening` catalogue — and that catalogue renders its cards from a client
 * component. A crawler that does not run it sees a page with no outbound links
 * to any test at all, which is how 190 pages end up looking like orphans and
 * getting crawled late or not at all.
 *
 * These are plain server-rendered `<a href>`s. They give every test page a real
 * path in and out, which is what lets crawl equity move between them.
 *
 * The window ROTATES (see `loadRelated`). The first version of this strip took
 * the twelve newest siblings, which meant every one of the ~190 pages emitted
 * the identical twelve links: twelve tests collected ~190 inbound links each
 * and the other ~175 still had none. Search Console read that exactly as it
 * looked — 136 URLs sat in "Discovered - currently not indexed". A strip that
 * links the same twelve pages everywhere is not internal linking, it is a
 * sitewide nav block.
 */
export async function RelatedTests({
  skill,
  excludeId,
}: {
  skill: "reading" | "listening";
  excludeId: string;
}) {
  const rows = await loadRelated(skill, excludeId);
  if (!rows.length) return null;

  const label = skill === "reading" ? "reading passages" : "listening tests";

  return (
    <section aria-labelledby="related-heading" className="mx-auto mt-12 max-w-3xl pb-6">
      <h2 id="related-heading" className="text-xl font-bold">
        More free IELTS {label}
      </h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={testPath(skill, t)}
              className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-soft transition hover:border-primary/40 hover:bg-surface-2"
            >
              {/* The link TEXT is the passage name — that is the anchor text
                  Google reads, and "read more" would waste every one of them. */}
              <span className="text-sm font-semibold leading-snug">{t.title}</span>
              <span className="mt-1 text-xs text-muted">
                {t.total ? `${t.total} questions` : "Practice test"}
                {t.question_types?.length ? ` · ${t.question_types[0]}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/${skill}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        See all IELTS {label} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

/**
 * Twelve siblings, chosen as the twelve that FOLLOW this test in a stable
 * ordering, wrapping past the end.
 *
 * Ordering every regular sibling by `created_at` and walking forward from this
 * test's own position makes the whole catalogue one cycle: test i links i+1
 * through i+12, so every test has exactly twelve inbound links and twelve
 * outbound ones, and a crawler entering at ANY page can reach every other page
 * by following them. No test is orphaned and none is over-linked.
 *
 * The ordering is `created_at` then `id`, never the raw database order: the tie
 * break matters because papers uploaded in one batch share a timestamp, and an
 * unstable sort there would hand different neighbours to the same page on
 * different renders — links that move on every crawl teach Google to trust none
 * of them.
 *
 * Service-role because this renders for logged-out visitors and needs `track`
 * to filter on; only non-sensitive columns are selected. Restricted to the
 * regular track for the same reason the sitemap is: pre_ielts / intro material
 * 404s for everyone else, so linking it would publish titles for pages a
 * crawler cannot open.
 *
 * Never throws - a missing related strip costs the page nothing, and a 500 on
 * a URL Google is crawling costs it everything.
 */
async function loadRelated(
  skill: "reading" | "listening",
  excludeId: string,
): Promise<RelatedRow[]> {
  try {
    // The FULL sibling list, not a page of it: the rotation needs this test's
    // index within the whole ordering, which a `.limit()` cannot give. These
    // are five small columns over ~190 rows.
    const { data } = await createAdminClient()
      .from("tests")
      .select("id, slug, title, total, question_types, track, created_at")
      .eq("skill", skill)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    const all = ((data ?? []) as (RelatedRow & { track: string | null })[]).filter((r) =>
      canAccessTrack({ role: "student", level: "regular" }, r.track ?? "regular"),
    );

    // Where this test sits in that ordering. -1 when the current test is off
    // the regular track (its own page still renders, and still deserves a
    // strip) - starting at 0 is the right fallback.
    const here = all.findIndex((r) => r.id === excludeId);
    const start = here === -1 ? 0 : here;

    const out: RelatedRow[] = [];
    // Walk forward from the NEXT sibling, wrapping. Bounded by `all.length` so
    // a catalogue smaller than twelve terminates instead of repeating itself.
    for (let step = 1; step <= all.length && out.length < RELATED_COUNT; step++) {
      const row = all[(start + step) % all.length];
      if (row.id !== excludeId) out.push(row);
    }
    return out;
  } catch (e) {
    console.error(`[seo] could not load related ${skill} tests:`, e);
    return [];
  }
}
