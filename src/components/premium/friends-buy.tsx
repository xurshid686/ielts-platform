"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CheckoutDialog } from "@/components/premium/checkout-dialog";
import type { PayProvider } from "@/components/premium/payment-logos";
import { FRIENDS_PLANS, FRIENDS_SEATS, PREMIUM_PLANS, formatUzs, perPerson } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The Friends price + buy button on /premium/friends: a 1/3-month switch and
 * "Get Friends", which opens the same payment window as /premium (Telegram
 * only while online payment is paused). A guest signs in first and comes back
 * with ?buy=friends&months=…, which reopens the window.
 */
export function FriendsBuy({
  signedIn,
  email,
  isAdmin,
  inGroup,
  providers,
  initialMonths,
  compact = false,
}: {
  signedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  inGroup: boolean;
  providers: PayProvider[];
  /** From ?buy=friends&months=…: open the payment window straight away. */
  initialMonths: number | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const valid = FRIENDS_PLANS.map((p) => p.months);
  const [months, setMonths] = useState<number>(
    initialMonths && valid.includes(initialMonths) ? initialMonths : (valid.at(-1) ?? 1),
  );
  const [open, setOpen] = useState<boolean>(signedIn && !isAdmin && !inGroup && initialMonths != null);
  const plan = FRIENDS_PLANS.find((p) => p.months === months) ?? FRIENDS_PLANS[0];
  const alone = (PREMIUM_PLANS.find((p) => p.months === months)?.priceUzs ?? 0) * FRIENDS_SEATS - plan.priceUzs;

  const buy = () => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/premium/friends?buy=friends&months=${months}`)}`);
      return;
    }
    setOpen(true);
  };

  return (
    <div className={cn("space-y-4", compact && "text-center")}>
      {!compact && (
        <>
          <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1" role="tablist" aria-label="Period">
            {FRIENDS_PLANS.map((p) => (
              <button
                key={p.months}
                role="tab"
                aria-selected={p.months === months}
                onClick={() => setMonths(p.months)}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                  p.months === months ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-4xl font-extrabold tabular-nums tracking-tight">{formatUzs(plan.priceUzs)}</span>
              <span className="text-sm text-muted">/ {plan.label} for {FRIENDS_SEATS} people</span>
            </p>
            <p className="mt-1 text-sm text-muted">{perPerson(plan)} per person</p>
            {alone > 0 && (
              <p className="mt-0.5 text-sm font-semibold text-success">
                Save {formatUzs(alone)} vs {FRIENDS_SEATS} separate Premiums
              </p>
            )}
          </div>
        </>
      )}

      {isAdmin ? (
        <p className="text-sm text-muted">You are an admin: create groups from a student&apos;s page in the admin panel.</p>
      ) : inGroup ? (
        <Link
          href="/premium/group"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 px-6 py-3 font-semibold text-primary hover:bg-primary/10"
        >
          Open my group <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={buy}
          data-buy="friends"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-premium-gradient px-6 py-3 font-semibold text-white shadow-sm hover:opacity-95"
        >
          Get Friends{compact ? ` · ${formatUzs(plan.priceUzs)}` : ""} <ArrowRight className="h-4 w-4" />
        </button>
      )}

      {open && (
        <CheckoutDialog
          plan="friends"
          months={months}
          email={email}
          providers={providers}
          onClose={() => {
            setOpen(false);
            if (initialMonths != null) router.replace("/premium/friends", { scroll: false });
          }}
        />
      )}
    </div>
  );
}
