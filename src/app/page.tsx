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
  Bot,
  ShieldCheck,
  CalendarDays,
  Gauge,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { TIERS, type TierName } from "@/lib/rating";

// One representative division per metal, lowest first — drives the rank ladder.
// Pulled from the real tier table so it can never drift from the live system.
const METAL_ORDER: TierName[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Master",
  "Grandmaster",
  "Legend",
];
const rankLadder = METAL_ORDER.map((name) => TIERS.find((t) => t.name === name)!);

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is it really free?",
    a: "Yes. You can create an account and practise Reading, Listening and Speaking tests for free. Premium unlocks extra exclusive materials, and you can also unlock individual premium tests with the XP you earn from practising.",
  },
  {
    q: "How is my band score calculated?",
    a: "Reading and Listening are graded automatically on the server against a hidden answer key the moment you submit, then converted to an IELTS band. Speaking is assessed by an AI examiner across fluency, vocabulary, grammar and pronunciation.",
  },
  {
    q: "Are the tests in the real exam format?",
    a: "Yes — passages, audio, timing and question types follow the computer-delivered IELTS format, so practising here feels like the real thing on test day.",
  },
  {
    q: "What is the rating and leaderboard?",
    a: "Every rated Reading test adjusts your rating with an Elo system — harder passages are worth more. You climb through eight tiers from Bronze to Legend and compete on global, weekly and monthly leaderboards.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. It runs entirely in your browser on desktop or mobile. Just sign up and start your first test.",
  },
];

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

        {/* ---- Feature deep-dive ---- */}
        <section className="pt-20 sm:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Everything in one place
            </span>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Built to feel like the real exam
            </h2>
            <p className="mt-3 text-muted">
              Not a quiz app — a full practice system that scores you honestly and shows
              you exactly what to fix next.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <Highlight
              icon={<Bot className="h-5 w-5" />}
              title="A live AI examiner"
              desc="Have a real spoken conversation with an AI examiner — it asks follow-ups, listens, and you talk back, just like Speaking parts 1–3. Or record a full mock for detailed band feedback."
              tone="rose"
            />
            <Highlight
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Honest server-side scoring"
              desc="Reading and Listening are graded on the server against a hidden answer key the instant you submit — scores can't be faked, so your band actually means something."
              tone="indigo"
            />
            <Highlight
              icon={<Gauge className="h-5 w-5" />}
              title="Know your weak spots"
              desc="Per-question-type analytics pinpoint where you lose marks and recommend the exact tests to fix them — true/false, matching headings, maps, and more."
              tone="teal"
            />
            <Highlight
              icon={<CalendarDays className="h-5 w-5" />}
              title="Weekly progress reports"
              desc="Every week you get a digest: tests done, average band, rating change and new achievements — delivered to your in-app inbox so you stay accountable."
              tone="amber"
            />
          </div>
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

        {/* ---- Rank ladder ---- */}
        <section className="pb-20 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 shadow-soft sm:p-12">
            <div className="orb -right-10 -top-16 h-56 w-56 bg-accent/10" />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Trophy className="h-3.5 w-3.5" /> Competitive ranking
                </span>
                <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                  Climb from Bronze to Legend
                </h2>
                <p className="mt-3 text-pretty text-muted">
                  Every rated Reading test moves your rating with a chess-style Elo
                  system — beat harder passages, climb faster. Eight tiers, global and
                  weekly leaderboards, and badges for every milestone keep practice
                  addictive.
                </p>
                <Button asChild size="lg" className="mt-7">
                  <Link href="/register">
                    Claim your rank <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {rankLadder.map((tier) => (
                  <li
                    key={tier.name}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-base shadow-sm ${tier.gradient}`}
                    >
                      {tier.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{tier.name}</p>
                      <p className="text-xs tabular-nums text-muted">
                        {tier.floor === 0 ? "Start here" : `${tier.floor.toLocaleString()}+`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section className="pb-20 sm:pb-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Questions, answered
            </h2>
          </div>
          <div className="mx-auto mt-10 max-w-3xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
            {FAQS.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-90 group-open:text-primary" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
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
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-sm">
              <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Logo size={24} /> IELTS Practice
              </span>
              <p className="mt-2 text-sm text-muted">
                Real exam-style practice with instant band scores, a live AI examiner and
                a competitive ranking that keeps you coming back.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <Link href="/register" className="text-muted transition-colors hover:text-foreground">
                Get started
              </Link>
              <Link href="/login" className="text-muted transition-colors hover:text-foreground">
                Sign in
              </Link>
              <Link href="/register" className="text-muted transition-colors hover:text-foreground">
                Reading & Listening
              </Link>
              <Link href="/register" className="text-muted transition-colors hover:text-foreground">
                Speaking with AI
              </Link>
            </nav>
          </div>
          <div className="mt-8 border-t border-border/60 pt-6 text-center text-sm text-muted">
            © {new Date().getFullYear()} IELTS Practice Platform. Practise daily, test confidently.
          </div>
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
    <Link
      href="/register"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-glow)]"
    >
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
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        Start now <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function Highlight({
  icon,
  title,
  desc,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: keyof typeof tones;
}) {
  const t = tones[tone];
  return (
    <div className="group flex gap-4 rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${t.chip}`}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
      </div>
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
