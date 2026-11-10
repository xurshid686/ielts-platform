import Link from "next/link";
import { ArrowRight, Crown, Gift } from "lucide-react";
import { PREMIUM_PRICE_LINE } from "@/lib/site";

/**
 * The "How to get Premium" box: the price, a button to the Premium page, and
 * the free route (invite a friend).
 *
 * It deliberately does NOT link to Telegram (owner, 2026-11-10). Every Premium
 * prompt on the site leads to /premium, which explains what is included and
 * what it costs; the Telegram buttons live on that page only.
 */
export function PremiumContact({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-premium/30 bg-premium/5 p-4 text-sm ${className}`}
    >
      <p className="font-medium">
        Premium: <span className="tabular-nums">{PREMIUM_PRICE_LINE}</span>
      </p>
      <p className="mt-1 text-muted">
        Every premium test and instant mock exam entry. Or invite a friend: when they join and
        complete their first test, you get a month free.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/premium"
          className="inline-flex items-center gap-2 rounded-lg bg-premium-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          <Crown className="h-4 w-4" /> Get Premium <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/refer"
          className="inline-flex items-center gap-2 rounded-lg border border-premium/40 px-4 py-2 text-sm font-semibold text-premium hover:bg-premium/10"
        >
          <Gift className="h-4 w-4" /> Earn it free
        </Link>
      </div>
    </div>
  );
}
