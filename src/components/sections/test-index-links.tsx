import Link from "next/link";
import { testPath } from "@/lib/tests/ref";

/**
 * A plain, complete, server-rendered list of every test in this skill.
 *
 * WHY THIS EXISTS, when the card grid above it already lists the same tests:
 * the grid is `TestBrowser`, a client component that caps itself at PAGE_SIZE
 * (24) and reveals the rest through a `setVisible` button. That button is not a
 * URL, so the served HTML of `/reading` carries 24 outbound test links and the
 * other ~150 papers appear nowhere on the site as an `<a href>`. Google found
 * them in the sitemap and declined to crawl them: on 2026-09-07 Search Console
 * reported 136 URLs "Discovered - currently not indexed", which is very nearly
 * the exact count of tests the catalogue never links to.
 *
 * DO NOT "fix" this by raising PAGE_SIZE or rendering every card. That was
 * measured and rejected — 171 cards is 506 KB of HTML and 171 hydrating
 * subtrees, and it is the reason the cap exists. A bare `<a>` costs about a
 * hundred bytes and hydrates nothing, so the full index here adds roughly 20 KB
 * to a page that was already 170 KB, and no client work at all.
 *
 * It is a real section for readers too, not a crawler-only appendix: the anchor
 * text is each paper's own title, the list is visible with no interaction, and
 * it is the fastest way to Ctrl-F the whole library. A hidden block of links
 * that only crawlers see is a doorway; this is a table of contents.
 */
export function TestIndexLinks({
  items,
  skill,
}: {
  items: { id: string; slug: string | null; title: string; questionCount: number | null }[];
  skill: "reading" | "listening";
}) {
  if (!items.length) return null;

  const label = skill === "reading" ? "reading passages" : "listening tests";

  return (
    <section aria-labelledby="test-index-heading" className="mt-12 border-t border-border pt-8">
      <h2 id="test-index-heading" className="text-lg font-semibold">
        All {items.length} IELTS {label}
      </h2>
      <p className="mt-1 text-sm text-muted">
        The complete library, in one list. Every paper is free to start.
      </p>
      <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <li key={t.id} className="text-sm leading-snug">
            <Link
              href={testPath(skill, t)}
              className="text-foreground/80 underline-offset-2 hover:text-primary hover:underline"
            >
              {t.title}
            </Link>
            {t.questionCount ? (
              <span className="ml-1 text-xs text-muted tabular-nums">({t.questionCount}q)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
