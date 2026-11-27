import { Check, ChevronDown, Crown, CreditCard, FileDown, Send } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";
import {
  FRIENDS_PLANS,
  FRIENDS_SEATS,
  PREMIUM_PLANS,
  PREMIUM_TELEGRAM_HANDLE,
  PREMIUM_TELEGRAM_URL,
  ULTIMA_PLANS,
  formatUzs,
} from "@/lib/site";
import { groupOf } from "@/lib/friends";
import { ultimaUntil } from "@/lib/ultima";
import { enabledProviders } from "@/lib/payments/config";
import { PaymentLogo } from "@/components/premium/payment-logos";
import { PricingCards } from "@/components/premium/pricing-cards";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Premium",
  description: `IELTS practice Premium: every premium test and instant mock exam entry. ${PREMIUM_PLANS.map(
    (p) => `${formatUzs(p.priceUzs)} for ${p.label}`,
  ).join(", ")}. Ultima for teachers adds a PDF of every reading test with answers: ${ULTIMA_PLANS.map(
    (p) => `${p.price} for ${p.label}`,
  ).join(", ")}.`,
  alternates: { canonical: "/premium" },
};

/**
 * What Premium is, what it costs and how to get it (redesigned 2026-11-24 after
 * ieltsx.com/pricing: period switch, Free / Premium / Ultima cards, ways to pay,
 * comparison, FAQ). Public: a visitor reads the prices before being asked for an
 * account. Pressing a paid plan opens the payment chooser; a guest signs in
 * first and returns with ?buy=<plan>&months=<n>, which reopens it.
 *
 * Prices are the owner's constants (lib/site.ts); counts are read at render time.
 * Real prices only: no countdowns or "was" prices (owner). Speaking is NOT sold
 * here (owner, 2026-11-10).
 */
export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ buy?: string; months?: string }>;
}) {
  const profile = await getProfile();
  const supabase = await createClient();
  const sp = await searchParams;

  // Named columns only: `tests` has column-level grants (0034).
  const { data } = await supabase.from("tests").select("skill").eq("tier", "premium").eq("track", "regular");
  const premiumTests = (data ?? []).length;

  const active = !!profile && isPremiumActive(profile);
  const isAdmin = profile?.role === "admin";
  const ultimaEnds = profile ? await ultimaUntil(profile.id) : null;
  const ultimaActive = isPremiumActive({ premium_until: ultimaEnds });
  // Online payment (0073): only providers whose keys are set on this host.
  const providers = enabledProviders();
  const inGroup = profile ? !!(await groupOf(profile.id)) : false;
  const online = providers.length > 0;

  const buyPlan: "premium" | "ultima" | "friends" | null =
    sp.buy === "premium" || sp.buy === "ultima" || sp.buy === "friends" ? sp.buy : null;
  const buyMonths = Number(sp.months);
  const initialBuy = buyPlan
    ? { plan: buyPlan, months: PREMIUM_PLANS.some((p) => p.months === buyMonths) ? buyMonths : 1 }
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-12 py-4">
      <header className="text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">Premium</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Every test in the library, a mock exam place without waiting, and AI checks for your writing.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {active && profile?.premium_until && (
            <p className="inline-flex items-center gap-2 rounded-full border border-premium/30 bg-premium/5 px-4 py-1.5 text-sm font-medium">
              <Crown className="h-4 w-4 text-premium" />
              You have Premium until {new Date(profile.premium_until).toISOString().slice(0, 10)}
            </p>
          )}
          {ultimaActive && ultimaEnds && (
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm font-medium">
              <FileDown className="h-4 w-4 text-primary" />
              You have Ultima until {new Date(ultimaEnds).toISOString().slice(0, 10)}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-6">
        <PricingCards
          signedIn={!!profile}
          email={profile?.email ?? null}
          isAdmin={isAdmin}
          premiumActive={active}
          ultimaActive={ultimaActive}
          inGroup={inGroup}
          premiumTests={premiumTests}
          providers={providers}
          initialBuy={initialBuy}
        />
      </div>

      {/* Ways to pay */}
      <section aria-labelledby="ways-to-pay" className="rounded-3xl border border-border bg-surface-2/60 p-6 sm:p-8">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">Accepted payments</p>
        <h2 id="ways-to-pay" className="mt-1 text-center text-2xl font-bold">
          Ways to pay
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-premium/10 text-premium">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  Pay online
                  {!online && (
                    <span className="rounded-full bg-premium/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-premium">
                      Coming soon
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {online
                    ? "Uzcard, Humo or Visa through Payme or Click. Premium switches on the moment you pay."
                    : "Uzcard, Humo or Visa through Payme or Click, with Premium switched on instantly. Opening very soon."}
                </p>
              </div>
            </div>
            <div className={`mt-4 flex flex-wrap gap-2 ${online ? "" : "opacity-75"}`}>
              <PaymentLogo provider="payme" height={18} />
              <PaymentLogo provider="click" height={18} />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#229ED9]/10 text-[#229ED9]">
                <Send className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Pay through Telegram</p>
                <p className="mt-0.5 text-sm text-muted">
                  Message our admin{" "}
                  <a href={PREMIUM_TELEGRAM_URL} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    {PREMIUM_TELEGRAM_HANDLE}
                  </a>
                  . We send the payment details and switch your plan on as soon as you pay.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          Every plan is one payment for a fixed period. Nothing renews or charges you again.
        </p>
      </section>

      {/* Compare plans */}
      <section aria-labelledby="compare">
        <h2 id="compare" className="text-center text-2xl font-bold">
          Compare plans
        </h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
          {/* No min-width: on a phone it hid the three plan columns off the right
              edge, so the table read as a list of features with nothing to compare. */}
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-left">
                <th className="px-3 py-3 font-medium text-muted sm:px-4">Features</th>
                <th className="px-1.5 py-3 text-center font-semibold sm:px-4">Free</th>
                <th className="bg-premium/5 px-1.5 py-3 text-center font-semibold text-premium sm:px-4">Premium</th>
                <th className="px-1.5 py-3 text-center font-semibold text-primary sm:px-4">Ultima</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Row label="Free reading and listening tests" free={<Yes />} premium={<Yes />} />
              <Row label="Band score, answer review, rating, streak" free={<Yes />} premium={<Yes />} />
              <Row label="Writing practice" free={<Yes />} premium={<Yes />} />
              <Row label="Premium tests" free="3 a week" premium={premiumTests > 0 ? `All ${premiumTests}` : "All"} />
              <Row label="Mock exam place" free="On request" premium="Instant" />
              <Row label="AI writing checks each month" free="—" premium="10" ultima="20" />
              <Row label="PDF of every reading test with answers" free="—" premium="—" ultima={<Yes />} />
              <Row label="Gold Premium badge" free="—" premium={<Yes />} />
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mx-auto max-w-3xl">
        <h2 id="faq" className="text-center text-2xl font-bold">
          Frequently asked questions
        </h2>
        <div className="mt-6 space-y-2">
          <Faq q="Is this a subscription?">
            No. You pay once for 1 or 3 months. When the period ends, Premium simply stops; nothing renews and
            nobody charges your card again.
          </Faq>
          <Faq q="How do I pay?">
            Press &ldquo;Get Premium&rdquo;, choose the period and how to pay.{" "}
            {online
              ? "With Payme or Click, Premium switches on the moment the payment goes through."
              : "Paying online with Payme or Click opens very soon. Until then, message our admin on Telegram and we switch Premium on as soon as you pay."}
          </Faq>
          <Faq q="I already have Premium. What happens if I buy more?">
            The new period is added on top of the time you have left, so you never lose days.
          </Faq>
          <Faq q="Can I try before buying?">
            Yes. Every account has free tests, 3 Premium tests free every week, and a one-time 3-day free trial
            of every Premium test after you finish your first test.
          </Faq>
          <Faq q="Is this the real IELTS exam?">
            No. It is a practice platform with the same computer-delivered exam screen, so test day feels
            familiar. It is not affiliated with IDP, the British Council or Cambridge, and the band you get here
            is an estimate.
          </Faq>
          <Faq q="What happens when my Premium ends?">
            Your account, results, streak and rating stay. You keep the free tests and your 3 free Premium tests
            a week; only the full library closes until you renew.
          </Faq>
          <Faq q="How does Friends work?">
            One person buys Friends ({FRIENDS_PLANS.map((p) => `${formatUzs(p.priceUzs)} for ${p.label}`).join(" or ")}) and
            gets an invite link. Up to {FRIENDS_SEATS - 1} friends open the link, sign in, and get Premium until the
            same date. Everyone keeps their own account, results and rating. Buying again extends the whole group.
          </Faq>
          <Faq q="What is Ultima?">
            Ultima is for teachers. It includes Premium for the same period, plus a PDF of every reading test with
            its answers sent to your Telegram, ready to print for class, and 20 AI writing checks a month.
          </Faq>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  free,
  premium,
  ultima,
}: {
  label: string;
  free: React.ReactNode;
  premium: React.ReactNode;
  /** Ultima includes Premium, so its cell defaults to the Premium one. */
  ultima?: React.ReactNode;
}) {
  return (
    <tr>
      <th scope="row" className="px-3 py-3 text-left font-normal sm:px-4">
        {label}
      </th>
      <td className="px-1.5 py-3 text-center text-muted sm:px-4">{free}</td>
      <td className="bg-premium/5 px-1.5 py-3 text-center font-medium sm:px-4">{premium}</td>
      <td className="px-1.5 py-3 text-center font-medium sm:px-4">{ultima ?? premium}</td>
    </tr>
  );
}

function Yes() {
  return (
    <>
      <Check className="mx-auto h-4 w-4 text-success" aria-hidden />
      <span className="sr-only">Yes</span>
    </>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-surface px-5 py-4 shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-3 text-sm text-muted">{children}</p>
    </details>
  );
}
