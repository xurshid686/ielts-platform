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
  const requestUrl = premiumRequestUrl(profile?.id);

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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-white">
          <Crown className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Premium
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          The whole test library, and a place in every mock exam without waiting for approval.
        </p>
        {active && profile?.premium_until && (
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-sm font-medium">
            <Crown className="h-4 w-4 text-amber-500" />
            You have Premium until {new Date(profile.premium_until).toISOString().slice(0, 10)}
          </p>
        )}
      </header>

      {/* Plans */}
      <section aria-label="Prices" className="grid gap-4 sm:grid-cols-2">
        {PREMIUM_PLANS.map((plan, i) => {
          const best = i === PREMIUM_PLANS.length - 1 && PREMIUM_PLANS.length > 1;
          return (
            <div
              key={plan.months}
              className={`relative rounded-2xl border bg-surface p-6 shadow-soft ${
                best ? "border-amber-500/50" : "border-border"
              }`}
            >
              {plan.note && (
                <span className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2.5 py-0.5 text-xs font-bold text-white">
                  {plan.note}
                </span>
              )}
              <p className="text-sm font-medium text-muted">{plan.label}</p>
              <p className="mt-1 text-4xl font-extrabold tabular-nums">{plan.price}</p>
              <p className="mt-1 text-sm text-muted">
                One payment. It ends by itself after {plan.label}; nothing renews automatically.
              </p>
            </div>
          );
        })}
      </section>

      {/* Call to action */}
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        {isAdmin ? (
          <p className="text-sm text-muted">
            You are an admin, so every test is already open to you. This is the page students see.
          </p>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              {active ? "Add more time" : "Get Premium"}
            </h2>
            <ol className="mx-auto mt-3 max-w-md space-y-1.5 text-left text-sm text-muted">
              <li>
                <strong className="text-foreground">1.</strong> Message{" "}
                {PREMIUM_TELEGRAM_HANDLE} on Telegram and say which period you want.
              </li>
              <li>
                <strong className="text-foreground">2.</strong> We send you the payment details.
              </li>
              <li>
                <strong className="text-foreground">3.</strong> After you pay, we switch Premium
                on for your account and it shows here.
              </li>
            </ol>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a
                href={requestUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-3 font-semibold text-white shadow-sm hover:opacity-95"
              >
                <Send className="h-4 w-4" /> {active ? "Renew on Telegram" : "Get Premium on Telegram"}
              </a>
              {!profile && (
                <Link
                  href="/register?next=%2Fpremium"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 font-semibold hover:bg-surface-2"
                >
                  Create a free account first <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            {!profile && (
              <p className="mt-3 text-xs text-muted">
                Premium is attached to an account, so you need one before we can switch it on.
              </p>
            )}
          </>
        )}
      </section>

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
                <th className="px-4 py-3 font-medium text-amber-600 dark:text-amber-400">
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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
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
