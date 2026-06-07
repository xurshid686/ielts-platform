import { Send } from "lucide-react";
import { PREMIUM_TELEGRAM_HANDLE, PREMIUM_TELEGRAM_URL } from "@/lib/site";

// How to get a Premium membership: contact the admin on Telegram.
export function PremiumContact({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm ${className}`}
    >
      <p className="font-medium">How to get Premium</p>
      <p className="mt-1 text-muted">
        Premium is activated by an admin. Message us on Telegram and we&apos;ll set you up.
      </p>
      <a
        href={PREMIUM_TELEGRAM_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
      >
        <Send className="h-4 w-4" /> Contact {PREMIUM_TELEGRAM_HANDLE}
      </a>
    </div>
  );
}
