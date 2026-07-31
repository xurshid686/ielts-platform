import Link from "next/link";
import { BookOpen, Headphones } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Chrome for the pages a logged-out visitor can see — the reading and listening
 * catalogues and each test's detail page.
 *
 * Deliberately not the signed-in AppShell: a sidebar full of Dashboard,
 * Leaderboard and Badges links that all bounce to /login would be worse than no
 * navigation. This gives them the two things they can actually use, and one
 * sign-up action.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/reading"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Reading</span>
            </Link>
            <Link
              href="/listening"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Headphones className="h-4 w-4" />
              <span className="hidden sm:inline">Listening</span>
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
