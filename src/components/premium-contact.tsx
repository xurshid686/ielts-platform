import Link from "next/link";
import { Send, Gift, ArrowRight } from "lucide-react";
import { PREMIUM_PRICE_LINE, premiumRequestUrl } from "@/lib/site";

/**
 * How to get a Premium membership: the price, a button that opens the Telegram
 * request, and the free route (invite a friend).
 *
 * `userId` makes the Telegram button carry the account id, so the owner can
 * see who is asking. Pass it wherever the viewer's profile is at hand.
 */
export function PremiumContact({
  className = "",
  userId,
}: {
  className?: string;
  userId?: string | null;
}) {
  return (
    <div
      className={`rounded-xl border border-premium/30 bg-premium/5 p-4 text-sm ${className}`}
    >
      <p className="font-medium">
        Premium: <span className="tabular-nums">{PREMIUM_PRICE_LINE}</span>
      </p>
      <p className="mt-1 text-muted">
        Message us on Telegram to pay and we switch it on for your account. Or invite a friend:
        when they join and complete their first test, you get a month free.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={premiumRequestUrl(userId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-premium-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          <Send className="h-4 w-4" /> Get Premium on Telegram
        </a>
        <Link
          href="/refer"
          className="inline-flex items-center gap-2 rounded-lg border border-premium/40 px-4 py-2 text-sm font-semibold text-premium hover:bg-premium/10 "
        >
          <Gift className="h-4 w-4" /> Earn it free
        </Link>
        <Link
          href="/premium"
          className="inline-flex items-center gap-1 px-2 py-2 text-sm font-medium text-muted hover:text-foreground"
        >
          What&apos;s included <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
