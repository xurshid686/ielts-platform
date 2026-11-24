"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PaymentLogo } from "@/components/premium/payment-logos";
import { startCheckout } from "@/app/actions/payments";

/**
 * "Pay with Payme" / "Pay with Click" on a /premium plan card (0073). Only the
 * providers whose keys are set on the server are passed in, so with no keys
 * nothing renders and the page keeps its Telegram button alone.
 */
export function PayButtons({
  months,
  providers,
  signedIn,
  best,
}: {
  months: number;
  providers: ("payme" | "click")[];
  signedIn: boolean;
  best: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (providers.length === 0) return null;

  function pay(provider: "payme" | "click") {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/premium")}`);
      return;
    }
    setError(null);
    setWhich(provider);
    start(async () => {
      const res = await startCheckout(months, provider);
      if (!res.ok) {
        setError(res.error);
        setWhich(null);
        return;
      }
      // The provider's own checkout page (an external site).
      window.location.assign(res.url);
    });
  }

  return (
    <div className="mt-5 space-y-2">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => pay(p)}
          disabled={pending}
          data-pay={p}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60 ${
            best ? "bg-premium-gradient text-white shadow-sm hover:opacity-95" : "border border-premium/40 text-premium hover:bg-premium/10"
          }`}
        >
          {pending && which === p && <Loader2 className="h-4 w-4 animate-spin" />}
          Pay with <PaymentLogo provider={p} height={16} />
        </button>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
