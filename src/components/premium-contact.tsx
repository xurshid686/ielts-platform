import Link from "next/link";
import { Send, Gift } from "lucide-react";
import { PREMIUM_TELEGRAM_HANDLE, PREMIUM_TELEGRAM_URL } from "@/lib/site";

// How to get a Premium membership: invite friends (free), or contact the admin.
export function PremiumContact({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm ${className}`}
    >
      <p className="font-medium">How to get Premium</p>
      <p className="mt-1 text-muted">
        Invite a friend — when they join and complete their first test, you get a free month. Or
        message us on Telegram to set it up directly.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/refer"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          <Gift className="h-4 w-4" /> Earn Premium free
        </Link>
        <a
          href={PREMIUM_TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
        >
          <Send className="h-4 w-4" /> Contact {PREMIUM_TELEGRAM_HANDLE}
        </a>
      </div>
    </div>
  );
}
