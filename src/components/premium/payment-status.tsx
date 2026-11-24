"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Crown, XCircle } from "lucide-react";
import { orderStatus, type OrderStatus } from "@/app/actions/payments";
import { PREMIUM_TELEGRAM_URL } from "@/lib/site";

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes; providers usually confirm within seconds

export function PaymentStatus({ orderId, initial }: { orderId: string; initial: OrderStatus }) {
  const [state, setState] = useState<OrderStatus>(initial);
  const [polls, setPolls] = useState(0);
  const settled = state?.status === "paid" || state?.status === "cancelled";

  useEffect(() => {
    if (!orderId || settled || polls >= MAX_POLLS) return;
    const t = setTimeout(async () => {
      setState(await orderStatus(orderId));
      setPolls((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [orderId, settled, polls]);

  const card = "rounded-2xl border border-border bg-surface p-8 text-center shadow-soft";

  if (!state) {
    return (
      <div className={card}>
        <XCircle className="mx-auto h-10 w-10 text-muted" />
        <h1 className="mt-3 text-xl font-bold">We can&apos;t find this payment</h1>
        <p className="mt-2 text-sm text-muted">If money left your card, message us and we&apos;ll sort it out quickly.</p>
        <a href={PREMIUM_TELEGRAM_URL} className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">
          Message us on Telegram
        </a>
      </div>
    );
  }

  if (state.status === "paid") {
    return (
      <div className={`${card} border-premium/40`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-premium-gradient text-white">
          <Crown className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">
          Payment received. {state.plan === "ultima" ? "Ultima" : "Premium"} is on!
        </h1>
        {state.until && (
          <p className="mt-2 text-muted">
            Your {state.plan === "ultima" ? "Ultima (and Premium)" : "Premium"} runs until <b>{state.until.slice(0, 10)}</b>.
          </p>
        )}
        <Link
          href="/reading"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white hover:opacity-95"
        >
          <CheckCircle2 className="h-4 w-4" /> Open the full library
        </Link>
      </div>
    );
  }

  if (state.status === "cancelled") {
    return (
      <div className={card}>
        <XCircle className="mx-auto h-10 w-10 text-danger" />
        <h1 className="mt-3 text-xl font-bold">The payment didn&apos;t go through</h1>
        <p className="mt-2 text-sm text-muted">Nothing was added to your account and nothing should have been charged.</p>
        <Link href="/premium" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className={card}>
      <Clock className="mx-auto h-10 w-10 animate-pulse text-premium" />
      <h1 className="mt-3 text-xl font-bold">Waiting for the payment…</h1>
      <p className="mt-2 text-sm text-muted">
        {polls >= MAX_POLLS
          ? "This is taking longer than usual. If you paid, Premium will switch on by itself. Message us if it doesn't within a few minutes."
          : "This page updates by itself as soon as Payme or Click confirms. Usually a few seconds."}
      </p>
      {polls >= MAX_POLLS && (
        <a href={PREMIUM_TELEGRAM_URL} className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">
          Message us on Telegram
        </a>
      )}
    </div>
  );
}
