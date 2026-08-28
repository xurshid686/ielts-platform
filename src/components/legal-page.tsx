import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Shared chrome for the two legal pages.
 *
 * These exist because Google's OAuth consent screen will not let an app leave
 * "Testing" without a reachable home page, privacy policy and terms — and while
 * an app is in Testing, only explicitly-listed test users can sign in with
 * Google at all (lifetime cap: 100).
 *
 * They are plain server components under (app), so a logged-out visitor gets
 * PublicShell and a signed-in one gets the normal AppShell.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-1 py-2">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {updated}</p>

      <div className="mt-8 space-y-8 text-[0.95rem] leading-relaxed text-muted">
        {children}
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
