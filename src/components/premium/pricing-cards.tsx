"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Crown, FileDown, Sparkles } from "lucide-react";
import { CheckoutDialog } from "@/components/premium/checkout-dialog";
import type { PayProvider } from "@/components/premium/payment-logos";
import { PREMIUM_PLANS, ULTIMA_PLANS, formatUzs } from "@/lib/site";

type Buy = { plan: "premium" | "ultima"; months: number };

/**
 * The /premium price row (owner, 2026-11-24, after ieltsx.com/pricing):
 * a period switch, then Free / Premium / Ultima side by side. Pressing a paid
 * plan opens the payment chooser; a guest signs in first and comes back with
 * ?buy=… so the chooser opens by itself. Real prices only: no "was" prices.
 */
export function PricingCards({
  signedIn,
  email,
  isAdmin,
  premiumActive,
  ultimaActive,
  premiumTests,
  providers,
  initialBuy,
}: {
  signedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  premiumActive: boolean;
  ultimaActive: boolean;
  premiumTests: number;
  providers: PayProvider[];
  initialBuy: Buy | null;
}) {
  const router = useRouter();
  const months0 = PREMIUM_PLANS.map((p) => p.months);
  const [months, setMonths] = useState<number>(
    initialBuy && months0.includes(initialBuy.months) ? initialBuy.months : (months0.at(-1) ?? 1),
  );
  const [buying, setBuying] = useState<Buy | null>(signedIn && !isAdmin ? initialBuy : null);

  const premium = PREMIUM_PLANS.find((p) => p.months === months)!;
  const ultima = ULTIMA_PLANS.find((p) => p.months === months) ?? ULTIMA_PLANS[0];
  const monthly = PREMIUM_PLANS.find((p) => p.months === 1)!;
  const saved = monthly.priceUzs * months - premium.priceUzs;

  function buy(plan: Buy["plan"]) {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/premium?buy=${plan}&months=${months}`)}`);
      return;
    }
    setBuying({ plan, months });
  }

  const tests = premiumTests > 0 ? `${Math.floor(premiumTests / 10) * 10}+ premium tests` : "Every premium test";

  return (
    <>
      {/* Period switch */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1" role="tablist" aria-label="Period">
          {PREMIUM_PLANS.map((p) => {
            const save = monthly.priceUzs * p.months - p.priceUzs;
            const on = p.months === months;
            return (
              <button
                key={p.months}
                role="tab"
                aria-selected={on}
                onClick={() => setMonths(p.months)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  on ? "bg-surface text-foreground shadow-soft" : "text-muted hover:text-foreground"
                }`}
              >
                {p.label}
                {save > 0 && <span className="ml-1.5 text-xs font-bold text-success">save {formatUzs(save)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <section aria-label="Prices" className="grid items-stretch gap-4 lg:grid-cols-3">
        {/* Free */}
        <Card>
          <CardHead title="Free" />
          <Price main="0 so'm" sub="forever · no card needed" />
          {isAdmin ? null : signedIn && !premiumActive ? (
            <span className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold text-muted">
              Your plan
            </span>
          ) : (
            <Link
              href="/reading"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 font-semibold hover:bg-surface-2"
            >
              Start practising <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Features
            items={[
              "Free reading and listening tests",
              "3 Premium tests free every week",
              "Band score and full answer review",
              "Writing practice (Task 1, Task 2, full test)",
              "Mock exams on request",
            ]}
          />
        </Card>

        {/* Premium */}
        <Card highlight>
          <CardHead title="Premium" tag="Most popular" icon={<Crown className="h-4 w-4" />} />
          <Price
            main={formatUzs(premium.priceUzs)}
            per={`/ ${premium.label}`}
            sub={`≈ ${premium.price}${months > 1 ? ` · ${formatUzs(Math.round(premium.priceUzs / months))} a month` : ""}`}
            save={saved > 0 ? `Save ${formatUzs(saved)}` : undefined}
          />
          {!isAdmin && (
            <button
              onClick={() => buy("premium")}
              data-buy="premium"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white shadow-sm hover:opacity-95"
            >
              {premiumActive ? "Add more Premium" : "Get Premium"} <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <Features
            lead="Everything in Free, plus:"
            items={[tests, "Mock exam place instantly", "10 AI writing checks a month", "Gold Premium badge on your profile"]}
            accent
          />
        </Card>

        {/* Ultima */}
        <Card>
          <CardHead title="Ultima" tag="For teachers" icon={<FileDown className="h-4 w-4" />} />
          <Price main={ultima.price} per={`/ ${ultima.label}`} sub="includes Premium for the same period" />
          {!isAdmin && (
            <button
              onClick={() => buy("ultima")}
              data-buy="ultima"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 px-5 py-3 font-semibold text-primary hover:bg-primary/10"
            >
              {ultimaActive ? "Add more Ultima" : "Get Ultima"} <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <Features
            lead="Everything in Premium, plus:"
            items={["PDF of every reading test with answers", "Sent to your Telegram, ready to print", "20 AI writing checks a month"]}
          />
        </Card>
      </section>

      {isAdmin && (
        <p className="text-center text-sm text-muted">
          You are an admin, so every test is already open to you. This is the page students see.
        </p>
      )}

      {buying && (
        <CheckoutDialog
          plan={buying.plan}
          months={buying.months}
          email={email}
          providers={providers}
          onClose={() => {
            setBuying(null);
            // Drop ?buy= so a reload doesn't reopen the chooser.
            if (initialBuy) router.replace("/premium", { scroll: false });
          }}
        />
      )}
    </>
  );
}

function Card({ highlight = false, children }: { highlight?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-surface p-6 shadow-soft ${
        highlight ? "border-premium/60 shadow-elevated ring-1 ring-premium/30" : "border-border"
      }`}
    >
      {children}
    </div>
  );
}

function CardHead({ title, tag, icon }: { title: string; tag?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        {icon && <span className="text-premium">{icon}</span>}
        {title}
      </h2>
      {tag && (
        <span className="inline-flex items-center gap-1 rounded-full bg-premium-gradient px-2.5 py-0.5 text-xs font-semibold text-white">
          <Sparkles className="h-3 w-3" /> {tag}
        </span>
      )}
    </div>
  );
}

function Price({ main, per, sub, save }: { main: string; per?: string; sub?: string; save?: string }) {
  return (
    <div className="mt-4 min-h-[5.5rem]">
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-4xl font-extrabold tabular-nums tracking-tight">{main}</span>
        {per && <span className="text-sm text-muted">{per}</span>}
      </p>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      {save && <p className="mt-0.5 text-sm font-semibold text-success">{save}</p>}
    </div>
  );
}

function Features({ lead, items, accent = false }: { lead?: string; items: string[]; accent?: boolean }) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      {lead && <p className="mb-3 text-sm font-semibold">{lead}</p>}
      <ul className="space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex items-start gap-2.5">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${accent ? "text-premium" : "text-success"}`} aria-hidden />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
