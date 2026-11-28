import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import { testPath } from "@/lib/tests/ref";

// "N free Premium tests left this week" (0069 weekly passes). Links only: a pass is spent
// solely by the explicit "Open this test free" click on the test page, never here.

export function PassesCard({
  left,
  tests,
}: {
  left: number;
  tests: { id: string; slug: string | null; title: string }[];
}) {
  if (left <= 0 || tests.length === 0) return null;
  return (
    <section
      aria-label="Free Premium tests this week"
      className="h-full rounded-2xl border border-premium/25 bg-premium/5 p-5"
    >
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-premium" />
        <h2 className="font-semibold">
          {left} free Premium {left === 1 ? "test" : "tests"} left this week
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted">Picked for your weak spots. Each one stays open for good once you open it.</p>
      <ul className="mt-3 grid gap-2">
        {tests.map((t) => (
          <li key={t.id}>
            <Link
              href={testPath("reading", t)}
              className="group flex h-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-premium/50"
            >
              <span className="truncate">{t.title}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-premium" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
