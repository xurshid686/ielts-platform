import Link from "next/link";
import { ArrowRight, Crown } from "lucide-react";
import { PREMIUM_PLANS } from "@/lib/site";

/**
 * Slim line shown on every app page while the 3-day trial runs (0069).
 * Links to /premium only — every Premium prompt does (owner, 2026-11-10).
 */
export function TrialBanner({ days }: { days: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-premium/30 bg-premium/5 px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-premium" />
        <span>
          Free trial: <strong>{days === 1 ? "last day" : `${days} days left`}</strong>. Every Premium test is open.
        </span>
      </span>
      <Link href="/premium" className="inline-flex items-center gap-1 font-semibold text-premium hover:underline">
        Keep it from {PREMIUM_PLANS[0].price} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
