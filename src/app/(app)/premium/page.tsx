import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  Crown,
  Gift,
  Send,
} from "lucide-react";
import { getProfile } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";
import { PREMIUM_PLANS, PREMIUM_TELEGRAM_HANDLE, premiumRequestUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Premium",
  description: `IELTS practice Premium: every premium test and instant mock exam entry. ${PREMIUM_PLANS.map(
    (p) => `${p.price} for ${p.label}`,
  ).join(", ")}.`,
  alternates: { canonical: "/premium" },
};

/**
 * What Premium is, what it costs and how to get it. Public: the layout falls
 * through to the logged-out shell, so a visitor can read the price before
 * being asked for an account.
 *
 * Every figure on this page is either a constant the owner set (the plans in
 * lib/site.ts) or read from the database at render time (the premium test
 * counts). Speaking is deliberately NOT sold here (owner, 2026-11-10: the AI
 * speaking examiner is not reliable enough to charge for), although premium
 * accounts do still get higher AI limits in `use_ai_quota` (migration 0010).
 */
export default async function PremiumPage() {
  const profile = await getProfile();
  const supabase = await createClient();

  // Named columns only: `tests` has column-level grants (0034), and the anon
  // role can read `skill`, `tier` and `track`.
  const { data } = await supabase
    .from("tests")
    .select("skill")
    .eq("tier", "premium")
    .eq("track", "regular");
  const premiumTests = (data ?? []) as { skill: string }[];
  const reading = premiumTests.filter((t) => t.skill === "reading").length;
  const listening = premiumTests.filter((t) => t.skill === "listening").length;

  const active = !!profile && isPremiumActive(profile);
  const isAdmin = profile?.role === "admin";

  const libraryLine =
    premiumTests.length > 0
      ? `${premiumTests.length} premium tests (${[
          reading ? `${reading} reading` : null,
          listening ? `${listening} listening` : null,
        ]
          .filter(Boolean)
          .join(", ")}), on top of every free one`
      : "Every premium test, on top of every free one";

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4">
      <header className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-premium-gradient text-white">
          <Crown className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Premium
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          The whole test library, and a place in every mock exam without waiting for approval.
        </p>
        {active && profile?.premium_until && (
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-premium/30 bg-premium/5 px-4 py-1.5 text-sm font-medium">
            <Crown className="h-4 w-4 text-premium" />
            You have Premium until {new Date(profile.premium_until).toISOString().slice(0, 10)}
          </p>
        )}
      </header>

      {/* Plans: each card carries its own button, so price and action share one screen */}
      <section aria-label="Prices" className="grid items-stretch gap-4 sm:grid-cols-2">
        {PREMIUM_PLANS.map((plan, i) => {
          const best = i === PREMIUM_PLANS.length - 1 && PREMIUM_PLANS.length > 1;
          return (
            <div
              key={plan.months}
              className={`flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-soft ${
                best ? "border-premium/60 shadow-elevated" : "border-border"
              }`}
            >
              <div
                className={`px-6 py-2 text-xs font-bold uppercase tracking-wide ${
                  best ? "bg-premium-gradient text-white" : "bg-surface-2 text-muted"
                }`}
              >
                {best ? `Best value${plan.note ? ` · ${plan.note}` : ""}` : "Try it"}
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-sm font-medium text-muted">{plan.label}</p>
                <p className="mt-1 text-5xl font-extrabold tabular-nums">{plan.price}</p>
                <p className="mt-2 flex-1 text-sm text-muted">
                  One payment. It ends by itself after {plan.label}; nothing renews automatically.
                </p>
                {!isAdmin && (
                  <a
                    href={premiumRequestUrl(profile?.id, plan.months)}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold ${
                      best
                        ? "bg-premium-gradient text-white shadow-sm hover:opacity-95"
                        : "border border-premium/40 text-premium hover:bg-premium/10"
                    }`}
                  >
                    <Send className="h-4 w-4" />
                    {active ? "Add" : "Get"} {plan.label} on Telegram
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {isAdmin ? (
        <p className="text-center text-sm text-muted">
          You are an admin, so every test is already open to you. This is the page students see.
        </p>
      ) : (
        <section aria-label="How it works">
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              `Tap a button above. It opens ${PREMIUM_TELEGRAM_HANDLE} on Telegram.`,
              "We send you the payment details.",
              "After you pay, we switch Premium on for your account and it shows here.",
            ].map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-premium/10 text-xs font-bold text-premium tabular-nums">
                  {i + 1}
                </span>
                <span className="text-muted">{step}</span>
              </li>
            ))}
          </ol>
          {!profile && (
            <p className="mt-4 text-center text-sm text-muted">
              Premium is attached to an account, so you need one before we can switch it on.{" "}
              <Link
                href="/register?next=%2Fpremium"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                Create a free account first <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </p>
          )}
        </section>
      )}

      {/* What is included */}
      <section>
        <h2 className="text-lg font-semibold">What you get</h2>
        <ul className="mt-4 space-y-3">
          <Included icon={<BookOpen className="h-5 w-5" />} title="The premium tests">
            {libraryLine}. Same exam screen, instant band score and full answer review.
          </Included>
          <Included icon={<ClipboardCheck className="h-5 w-5" />} title="Mock exams without waiting">
            Join any open mock exam straight away. Free accounts send a request and wait for it
            to be approved.
          </Included>
        </ul>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted"> </th>
                <th className="px-4 py-3 font-medium">Free</th>
                <th className="px-4 py-3 font-medium text-premium">
                  Premium
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Row label="Free reading and listening tests" free={<Yes />} premium={<Yes />} />
              <Row label="Band score, review, rating, streak" free={<Yes />} premium={<Yes />} />
              <Row label="Writing practice" free={<Yes />} premium={<Yes />} />
              <Row label="Premium tests" free="No" premium={<Yes />} />
              <Row label="Mock exam place" free="On request" premium="Instant" />
            </tbody>
          </table>
        </div>
      </section>

      {/* The free route */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold">Or earn it free</h2>
            <p className="mt-0.5 text-sm text-muted">
              Invite a friend. When they join and complete their first test, you get a month of
              Premium. There is no limit.
            </p>
          </div>
        </div>
        <Link
          href={profile ? "/refer" : "/register?next=%2Frefer"}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          Invite friends <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}

function Included({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-premium/10 text-premium">
        {icon}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

function Row({
  label,
  free,
  premium,
}: {
  label: string;
  free: React.ReactNode;
  premium: React.ReactNode;
}) {
  return (
    <tr>
      <th scope="row" className="px-4 py-3 text-left font-normal">
        {label}
      </th>
      <td className="px-4 py-3 text-muted">{free}</td>
      <td className="px-4 py-3 font-medium">{premium}</td>
    </tr>
  );
}

function Yes() {
  return (
    <>
      <Check className="h-4 w-4 text-success" aria-hidden />
      <span className="sr-only">Yes</span>
    </>
  );
}
