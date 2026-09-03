import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CONTACT_TELEGRAM_URL } from "@/lib/site";

/**
 * Chrome for the pages a logged-out visitor can see — the reading and listening
 * catalogues and each test's detail page.
 *
 * It now shares its header with the signed-in shell (SiteHeader), so the site
 * keeps its shape through login. The links still differ, and deliberately so:
 * a bar full of Dashboard, Leaderboard and Discipline entries that all bounce
 * to /login would be worse than no navigation. navItemsFor(null) is where that
 * choice lives.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader profile={null} variant="public" />

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} IELTS Practice</span>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href={CONTACT_TELEGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Contact us
            </a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
