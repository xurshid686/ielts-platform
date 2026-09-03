import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTrack } from "@/lib/levels";

type RelatedRow = {
  id: string;
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
              href={`/${skill}/${t.id}`}
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
 * Twelve of the newest sibling tests, minus this one.
 *
 * Service-role because this renders for logged-out visitors and needs `track`
 * to filter on; only non-sensitive columns are selected. Restricted to the
 * regular track for the same reason the sitemap is: pre_ielts / intro material
 * 404s for everyone else, so linking it would publish titles for pages a
 * crawler cannot open.
 *
 * Never throws — a missing related strip costs the page nothing, and a 500 on
 * a URL Google is crawling costs it everything.
 */
async function loadRelated(
  skill: "reading" | "listening",
  excludeId: string,
): Promise<RelatedRow[]> {
  try {
    const { data } = await createAdminClient()
      .from("tests")
      .select("id, title, total, question_types, track")
      .eq("skill", skill)
      .neq("id", excludeId)
      .order("created_at", { ascending: false })
      .limit(24);

    return ((data ?? []) as (RelatedRow & { track: string | null })[])
      .filter((r) => canAccessTrack({ role: "student", level: "regular" }, r.track ?? "regular"))
      .slice(0, 12);
  } catch (e) {
    console.error(`[seo] could not load related ${skill} tests:`, e);
    return [];
  }
}
