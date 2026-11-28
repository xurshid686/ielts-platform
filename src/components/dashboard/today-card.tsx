import Link from "next/link";
import { ArrowRight, Check, Clock, Gift, Crown, BookOpen } from "lucide-react";
import { testPath } from "@/lib/tests/ref";
import type { TypeStat } from "@/lib/analytics";

// The dashboard's centrepiece: ONE test for today (lib/today-pick.ts, the same pick the
// 10:00 Telegram message sends). Laid out like an exam-day slip: a tear-off date block on
// the left, the paper on the right. Once the student has finished something today the
// date block is stamped "Done" and the next paper drops to a smaller "Another one?".

export type TodayTest = {
  id: string;
  slug: string | null;
  title: string;
  kind: "single" | "full";
  passage: number | null;
};

type Props = {
  /** YYYY-MM-DD in the student's zone. */
  day: string;
  first: boolean;
  pick: { test: TodayTest; kind: "free" | "pass" | "open"; weak: TypeStat | null } | null;
  /** Bands of what they finished today (newest first); empty = not done yet. */
  doneBands: (number | null)[];
  passesLeft: number | null;
};

function paperLine(t: TodayTest): string {
  if (t.kind === "full") return "Full reading test · 3 passages · 60 min";
  return `${t.passage ? `Reading passage ${t.passage}` : "Reading passage"} · 20 min`;
}

function KindChip({ kind, passesLeft }: { kind: "free" | "pass" | "open"; passesLeft: number | null }) {
  if (kind === "free") return <span className="rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-semibold text-success">Free</span>;
  if (kind === "open")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-premium/12 px-2.5 py-0.5 text-xs font-semibold text-premium">
        <Crown className="h-3 w-3" /> Premium
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-premium/12 px-2.5 py-0.5 text-xs font-semibold text-premium">
      <Gift className="h-3 w-3" /> Uses 1 of your {passesLeft ?? 3} free Premium tests
    </span>
  );
}

function DateBlock({ day, done }: { day: string; done: boolean }) {
  const d = new Date(`${day}T12:00:00Z`);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <div
      aria-hidden
      className={`relative flex w-20 shrink-0 flex-col items-center justify-center self-stretch rounded-xl border-2 border-dashed py-3 sm:w-24 ${
        done ? "border-success/50 bg-success/8 text-success" : "border-primary/35 bg-primary/6 text-primary"
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{weekday}</span>
      <span className="font-display text-4xl font-extrabold leading-none tabular-nums sm:text-5xl">{d.getUTCDate()}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{month}</span>
      {done && (
        <span className="today-stamp absolute -right-2 -top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-success text-white shadow-soft">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

export function TodayCard({ day, first, pick, doneBands, passesLeft }: Props) {
  const done = doneBands.length > 0;
  const lastBand = doneBands.find((b) => b != null) ?? null;

  return (
    <section
      aria-label="Today's test"
      data-today-card={done ? "done" : "todo"}
      className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated"
    >
      <div className={`h-1.5 w-full ${done ? "bg-success" : "bg-brand-gradient"}`} />
      <div className="flex gap-4 p-5 sm:gap-6 sm:p-6">
        <DateBlock day={day} done={done} />

        <div className="min-w-0 flex-1">
          {done ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success">Done for today</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                {lastBand != null ? `Band ${lastBand}` : "Test finished"}
                <span className="ml-2 align-middle text-base font-medium text-muted">
                  {doneBands.length > 1 ? `· ${doneBands.length} tests today` : ""}
                </span>
              </h2>
              <p className="mt-1.5 text-sm text-muted">Your streak is safe. Come back tomorrow for the next one.</p>
              {pick && (
                <Link
                  href={testPath("reading", pick.test)}
                  className="group mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-muted">Another one?</span>
                    <span className="block truncate font-semibold">{pick.test.title}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              )}
            </>
          ) : pick ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                {first ? "Your first test" : "Today's test"}
              </p>
              <h2 className="mt-1 text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{pick.test.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {paperLine(pick.test)}
                </span>
                <KindChip kind={pick.kind} passesLeft={passesLeft} />
              </div>
              <p className="mt-3 text-sm">
                {pick.weak ? (
                  <>
                    Trains <strong>{pick.weak.type}</strong>, your weakest question type
                    <span className="text-muted"> ({pick.weak.accuracy}% correct so far)</span>.
                  </>
                ) : first ? (
                  "The real exam screen, and your band the moment you submit."
                ) : (
                  "Picked to match your level. A few more tests and we'll aim it at your weakest question type."
                )}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  href={testPath("reading", pick.test)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-all hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Start the test <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/reading" className="text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline">
                  Choose another
                </Link>
                {first && (
                  <Link href="/listening" className="text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline">
                    Start with Listening
                  </Link>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Today</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">You&apos;ve done every test you can open</h2>
              <p className="mt-1.5 text-sm text-muted">New tests arrive every week. Meanwhile, try Listening or a Writing task.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/listening" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                  <BookOpen className="h-4 w-4" /> Listening tests
                </Link>
                <Link href="/writing" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">
                  Writing practice
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
