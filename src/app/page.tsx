import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  Flame,
  ArrowRight,
  Sparkles,
  Trophy,
  Target,
  BarChart3,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in users skip the marketing page and go straight to their dashboard.
  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Decorative backdrop: blueprint grid + soft orbs */}
      <div className="bg-grid-faint pointer-events-none absolute inset-x-0 top-0 h-[42rem]" />
      <div className="orb left-[8%] top-24 h-72 w-72 bg-primary/20 dark:bg-primary/25" />
      <div className="orb right-[6%] top-48 h-80 w-80 bg-accent/15 dark:bg-accent/20" />

      <header className="sticky top-0 z-30 border-b border-border/60 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2.5 text-lg font-semibold">
            <Logo size={38} priority />
            IELTS Practice
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        {/* ---- Hero ---- */}
        <section className="pb-14 pt-16 text-center sm:pb-20 sm:pt-24">
          <div
            className="animate-rise mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-soft"
            style={{ "--rise-delay": "0ms" } as React.CSSProperties}
          >
            <Flame className="h-4 w-4 text-warning" /> Build a daily streak. Hit your band.
          </div>

          <h1
            className="animate-rise mx-auto mt-7 max-w-3xl text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl"
            style={{ "--rise-delay": "80ms" } as React.CSSProperties}
          >
            Practice IELTS the way you{" "}
            <span className="text-brand-gradient animate-gradient-pan">actually test</span>.
          </h1>

          <p
            className="animate-rise mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted"
            style={{ "--rise-delay": "160ms" } as React.CSSProperties}
          >
            Reading, Listening and Speaking in one place — real tests, instant scoring,
            and a live AI examiner you can actually talk to. Automatic progress tracking
            and a streak system keep you practising every day.
          </p>

          <div
            className="animate-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ "--rise-delay": "240ms" } as React.CSSProperties}
          >
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/register">
                Start practising free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/login">I have an account</Link>
            </Button>
          </div>

          <ul
            className="animate-rise mx-auto mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted"
            style={{ "--rise-delay": "320ms" } as React.CSSProperties}
          >
            {["Free to start", "Real exam format", "Instant band scores"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" /> {t}
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Skill cards ---- */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<BookOpen />}
            title="Reading"
            desc="Full exam-style tests, graded on the server the moment you submit."
            tone="indigo"
          />
          <Feature
            icon={<Headphones />}
            title="Listening"
            desc="Audio tests scored automatically, with history and best-band tracking."
            tone="teal"
          />
          <Feature
            icon={<Mic />}
            title="Speaking"
            desc="Talk live with an AI examiner, or record a full mock for band feedback."
            tone="rose"
            badge="New"
          />
          <Feature
            icon={<PenLine />}
            title="Writing"
            desc="Task 1 & 2 editor with AI band feedback."
            tone="amber"
            badge="Soon"
          />
        </section>

        {/* ---- How it works ---- */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="h-3.5 w-3.5" /> How it works
            </span>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              From first test to target band
            </h2>
            <p className="mt-3 text-muted">
              A simple loop that compounds: practise, get scored, see exactly what to fix.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Step
              n="01"
              icon={<Target className="h-5 w-5" />}
              title="Take a real test"
              desc="Exam-format Reading, Listening and Speaking — the same timing and question types you'll face on test day."
            />
            <Step
              n="02"
              icon={<BarChart3 className="h-5 w-5" />}
              title="Get scored instantly"
              desc="Server-side grading and AI band feedback the moment you submit — no waiting, no guesswork."
            />
            <Step
              n="03"
              icon={<Trophy className="h-5 w-5" />}
              title="Climb the leaderboard"
              desc="A rating that grows with every rated test, streaks, badges and weekly reports keep you accountable."
            />
          </div>
        </section>

        {/* ---- CTA band ---- */}
        <section className="pb-20 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-8 text-center text-white shadow-elevated sm:p-14">
            <div className="ring-hairline absolute inset-0 rounded-3xl" />
            <div className="orb -left-10 -top-16 h-56 w-56 bg-white/20" />
            <div className="orb -bottom-20 -right-10 h-64 w-64 bg-white/15" />
            <div className="relative">
              <Zap className="mx-auto h-8 w-8 text-white/90" />
              <h2 className="mx-auto mt-4 max-w-xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Your band score won&apos;t raise itself.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-white/85">
                Start today, keep the streak alive, and watch your average band climb
                week after week.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-8 bg-white text-primary shadow-none hover:bg-white/90"
              >
                <Link href="/register">
                  Create your free account <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <Logo size={22} /> IELTS Practice
          </span>
          <p>© {new Date().getFullYear()} IELTS Practice Platform. Practise daily, test confidently.</p>
        </div>
      </footer>
    </div>
  );
}

const tones = {
  indigo: {
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-500/15",
    edge: "from-indigo-500/60",
  },
  teal: {
    chip: "bg-teal-500/10 text-teal-600 dark:text-teal-400 group-hover:bg-teal-500/15",
    edge: "from-teal-500/60",
  },
  rose: {
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 group-hover:bg-rose-500/15",
    edge: "from-rose-500/60",
  },
  amber: {
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500/15",
    edge: "from-amber-500/60",
  },
} as const;

function Feature({
  icon,
  title,
  desc,
  badge,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  tone: keyof typeof tones;
}) {
  const t = tones[tone];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-glow)]">
      {/* Accent edge that lights up on hover */}
      <span
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${t.edge} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="flex items-center justify-between">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${t.chip}`}
        >
          {icon}
        </div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  desc,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          {icon}
        </div>
        <span className="text-3xl font-extrabold tracking-tight text-border transition-colors group-hover:text-primary/25">
          {n}
        </span>
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}
