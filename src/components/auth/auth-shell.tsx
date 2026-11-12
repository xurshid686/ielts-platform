import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { SITE_NAME } from "@/lib/site";

/**
 * The frame shared by /login, /register, /forgot-password and /reset-password:
 * a panel on the left from `lg`, the form on the right.
 *
 * Each PAGE renders this (rather than (auth)/layout.tsx) because the panel
 * differs per page — a new visitor on /register gets the full case for an
 * account, a returning one on /login gets far less — and a layout cannot see
 * which page it is wrapping.
 *
 * The panel sits on the page's own warm paper with a hairline between it and
 * the form; it used to be a full-height orange gradient with frosted icon
 * chips. Below `lg` the panel is not rendered visibly at all, so anything a
 * phone visitor must read belongs in the page itself, above the form.
 */
export function AuthShell({
  panel,
  children,
}: {
  panel: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col border-r border-border px-10 py-6 lg:flex xl:px-16">
        <Link href="/" className="flex items-center gap-2.5 self-start text-lg font-semibold">
          <Logo size={38} />
          {SITE_NAME}
        </Link>
        <div className="my-auto w-full max-w-[30rem] py-6">{panel}</div>
      </aside>

      <div className="flex min-w-0 flex-col lg:bg-surface">
        <div className="flex items-center justify-between px-4 py-3 lg:justify-end">
          {/* The only way home on a phone, where the panel (and its logo) is hidden. */}
          <Link href="/" className="flex items-center gap-2 font-semibold lg:hidden">
            <Logo size={30} />
            {SITE_NAME}
          </Link>
          <ThemeToggle />
        </div>

        <main className="flex flex-1 items-center justify-center px-6 pb-8 pt-2 lg:pb-16">
          <div className="w-full max-w-sm animate-fade-in-up">
            {children}
            {/* Every page in this group gets this — login, register and both
                password-reset steps — which is where the visible legal links live. */}
            <p className="mt-6 text-center text-xs leading-relaxed text-muted">
              By continuing you agree to our{" "}
              <Link href="/terms" className="underline hover:text-foreground">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
