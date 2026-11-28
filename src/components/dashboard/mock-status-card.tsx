import Link from "next/link";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { loadMockStatus } from "@/lib/dashboard-data";

// Only when there is something to DO or to SEE about a mock exam (lib/dashboard-data.ts
// loadMockStatus); otherwise nothing, and the Mock tab in the nav is the way in.
// Streamed under <Suspense> on Today.
export async function MockStatusCard({ userId }: { userId: string }) {
  const item = await loadMockStatus(userId);
  if (!item) return null;
  return (
    <Link
      href={`/mock/${item.mockId}`}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-soft transition-colors hover:border-primary/40"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ClipboardCheck className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{item.title}</span>
        <span className="block truncate text-sm text-muted">
          {item.mockTitle} · {item.body}
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        {item.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
