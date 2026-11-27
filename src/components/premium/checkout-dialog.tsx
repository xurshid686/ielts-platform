"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { startCheckout } from "@/app/actions/payments";
import { PaymentLogo, type PayProvider } from "@/components/premium/payment-logos";
import {
  FRIENDS_PLANS,
  FRIENDS_SEATS,
  PREMIUM_PLANS,
  ULTIMA_PLANS,
  formatUzs,
  friendsRequestUrl,
  premiumRequestUrl,
  ultimaRequestUrl,
} from "@/lib/site";

type Method = PayProvider | "telegram";

/**
 * "Choose how to pay": opens after a signed-in student presses a plan's button
 * (owner, 2026-11-24, modelled on ieltsx.com/pricing). Payme/Click go through
 * startCheckout (the server prices the order); a provider that is not switched
 * on is shown as "Coming soon" and cannot be picked. Telegram always works.
 * Ultima is paid the same way (0074: the order carries the plan).
 */
export function CheckoutDialog({
  plan,
  months,
  email,
  providers,
  onClose,
}: {
  plan: "premium" | "ultima" | "friends";
  months: number;
  email: string | null;
  providers: PayProvider[];
  onClose: () => void;
}) {
  const table = plan === "ultima" ? ULTIMA_PLANS : plan === "friends" ? FRIENDS_PLANS : PREMIUM_PLANS;
  const chosen = table.find((p) => p.months === months) ?? table[0];
  const online: PayProvider[] = providers;
  const [method, setMethod] = useState<Method>(online[0] ?? "telegram");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = plan === "ultima" ? "Ultima" : plan === "friends" ? `Friends (${FRIENDS_SEATS} people)` : "Premium";
  const price = formatUzs(chosen.priceUzs);
  const period = chosen.label;
  const requestUrl = plan === "ultima" ? ultimaRequestUrl : plan === "friends" ? friendsRequestUrl : premiumRequestUrl;
  const telegramUrl = requestUrl(email, chosen.months);

  function go() {
    setError(null);
    if (method === "telegram") {
      window.open(telegramUrl, "_blank", "noopener,noreferrer");
      return;
    }
    start(async () => {
      const res = await startCheckout(chosen.months, method, plan);
      if (!res.ok) return setError(res.error);
      window.location.assign(res.url); // the provider's own checkout page
    });
  }

  const rows: { id: Method; title: React.ReactNode; note: string; enabled: boolean }[] = [
    ...(["payme", "click"] as const).map((p) => ({
      id: p as Method,
      title: <PaymentLogo provider={p} height={16} />,
      note: online.includes(p) ? `Uzcard, Humo or Visa. ${label} switches on instantly.` : "Coming soon",
      enabled: online.includes(p),
    })),
    {
      id: "telegram",
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          <Send className="h-4 w-4 text-[#229ED9]" /> Telegram
        </span>
      ),
      note: "Message our admin; we send payment details and switch your plan on after you pay.",
      enabled: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="relative w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 shadow-elevated sm:rounded-2xl"
      >
        <button
          onClick={() => !pending && onClose()}
          className="absolute right-3 top-3 text-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 id="checkout-title" className="text-lg font-bold">
          Choose how to pay
        </h3>
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-sm">
            <b>{label}</b> · {period}
          </span>
          <span className="text-lg font-extrabold tabular-nums">{price}</span>
        </div>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Payment method">
          {rows.map((r) => {
            const selected = method === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={!r.enabled}
                disabled={!r.enabled || pending}
                data-method={r.id}
                onClick={() => setMethod(r.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? "border-premium bg-premium/5 ring-1 ring-premium"
                    : "border-border hover:bg-surface-2"
                } ${r.enabled ? "" : "cursor-not-allowed opacity-55 hover:bg-transparent"}`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-premium bg-premium text-white" : "border-border"
                  }`}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{r.title}</span>
                  <span className={`mt-1 block text-xs ${r.enabled ? "text-muted" : "font-semibold uppercase tracking-wide text-premium"}`}>
                    {r.note}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          onClick={go}
          disabled={pending}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {method === "telegram" ? "Continue on Telegram" : `Pay ${price}`}
        </button>
        <p className="mt-3 text-center text-xs text-muted">One payment. Nothing renews automatically.</p>
      </div>
    </div>
  );
}
