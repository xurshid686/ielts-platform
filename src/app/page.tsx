import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  Flame,
  ArrowRight,
  Zap,
  CheckCircle2,
  ClipboardCheck,
  Crown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { TIERS, type TierName } from "@/lib/rating";
import { RankBadge } from "@/components/rating/rank-badge";
import { CONTACT_TELEGRAM_URL, PREMIUM_PLANS, SITE_NAME } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";
import { TryQuestion } from "@/components/landing/try-question";
import { CountUp } from "@/components/landing/count-up";
import { Detail } from "@/components/landing/detail";

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

// The page's type scale, in one place. The hero headline is the only extrabold
// line; section headings are a lighter weight so the two do not compete, and
// section labels are plain small caps (they used to be icon pills).
const EYEBROW_BASE = "text-xs font-semibold uppercase tracking-[0.14em]";
const EYEBROW = `${EYEBROW_BASE} text-primary`;
const H2 =
  "text-balance text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[2.5rem]";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is it really free?",
    a: `Yes. You can create an account and practise Reading, Listening, Writing and Speaking for free. Premium adds the premium tests and instant mock exam entry, for ${PREMIUM_PLANS.map((p) => `${p.price} for ${p.label}`).join(" or ")}.`,
  },
  {
    q: "How is my band score calculated?",
    a: "Reading and Listening are graded automatically on the server against a hidden answer key the moment you submit, then converted to an IELTS band. Speaking is for practice: you answer real Part 1-3 questions and record yourself.",
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

  // The library's real size, counted on the server (cached for an hour).
  // A figure of zero is left out: "0 tests" is worse than no figure.
  const stats = await getSiteStats();
  const figures = stats
    ? [
        { n: stats.reading, label: "Reading tests" },
        { n: stats.listening, label: "Listening tests" },
        { n: stats.task2, label: "Writing Task 2 questions" },
        { n: stats.task1, label: "Writing Task 1 charts" },
      ].filter((f) => f.n > 0)
    : [];

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-30 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2.5 text-lg font-semibold">
            <Logo size={38} priority />
            {SITE_NAME}
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
          {/* Two columns from `lg`: the pitch on the left, one real question
              on the right. Below `lg` it is one centred column and the
              question follows the buttons. */}
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:gap-14 lg:text-left">
            <div>
              <div
                className="animate-rise mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-soft lg:mx-0"
                style={{ "--rise-delay": "0ms" } as React.CSSProperties}
              >
                <Flame className="h-4 w-4 text-warning" /> Build a daily streak. Hit your band.
              </div>

              <h1
                className="animate-rise mx-auto mt-7 max-w-4xl text-balance text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:mx-0 xl:text-[4rem]"
                style={{ "--rise-delay": "80ms" } as React.CSSProperties}
              >
                Practice IELTS the way you{" "}
                <span className="text-primary">actually test</span>.
              </h1>

              <p
                className="animate-rise mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted lg:mx-0"
                style={{ "--rise-delay": "160ms" } as React.CSSProperties}
              >
                Reading, Listening, Writing and Speaking in one place — real tests in the
                exam format, with instant scoring. Automatic progress tracking and a streak
                system keep you practising every day.
              </p>

              <div
                className="animate-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:flex-col lg:items-start"
                style={{ "--rise-delay": "240ms" } as React.CSSProperties}
              >
                {/* The catalogue is public and a free test is gradeable without an
                    account, so the primary action is the product itself, not a
                    signup form. `h-auto … whitespace-normal` because size="lg" is a
                    fixed h-11 and this label wraps on a narrow phone. */}
                <Button
                  asChild
                  size="lg"
                  className="h-auto min-h-11 w-full whitespace-normal py-2.5 leading-snug sm:w-auto"
                >
                  <Link href="/reading">
                    Try a free Reading test — no account needed{" "}
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/register">Create a free account</Link>
                </Button>
              </div>

              <ul
                className="animate-rise mx-auto mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted lg:mx-0 lg:justify-start"
                style={{ "--rise-delay": "320ms" } as React.CSSProperties}
              >
                {["No account needed", "Real exam format", "Instant band scores"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-success" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* The product itself, before any click: answer it and it is marked.
                Capped and centred below `lg` so it does not stretch on a tablet. */}
            <div
              className="animate-rise mx-auto w-full max-w-xl lg:max-w-none"
              style={{ "--rise-delay": "400ms" } as React.CSSProperties}
            >
              <TryQuestion />
            </div>
          </div>

          {/* Proof, not adjectives: the actual player a student sits in.
              --rise-delay continues the hero's 0/80/160/240/320/400 stagger. */}
          <figure
            className="animate-rise mt-14 sm:mt-20"
            style={{ "--rise-delay": "480ms" } as React.CSSProperties}
          >
            <Shot
              name="player"
              alt="The exam player: passage on the left, questions on the right, timer running."
            />
            <figcaption className="mt-3 text-sm text-muted">
              The real computer-delivered layout — passage left, questions right, timer
              running. Nothing to install.
            </figcaption>
          </figure>
        </section>

        {/* ---- The library in figures ---- */}
        {figures.length >= 2 && (
          <section aria-label="The library in numbers" className="mb-12 border-y border-border sm:mb-16">
            <dl className="grid grid-cols-2 lg:grid-cols-4">
              {figures.map((f, i) => (
                <div
                  key={f.label}
                  // Hairlines between figures: a left rule on every cell that
                  // is not first in its row, and a top rule on the phone's
                  // second row.
                  className={`flex flex-col-reverse justify-end px-3 py-6 text-center sm:py-8 ${
                    i % 2 === 1 ? "border-l border-border" : ""
                  } ${i >= 2 ? "border-t border-border lg:border-t-0" : ""} ${
                    i === 2 ? "lg:border-l" : ""
                  }`}
                >
                  <dt className="mt-1.5 text-sm text-muted">{f.label}</dt>
                  <dd className="font-display text-4xl font-semibold tabular-nums tracking-[-0.02em] sm:text-5xl">
                    <CountUp value={f.n} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ---- Skill cards ---- */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            href="/reading"
            icon={<BookOpen />}
            title="Reading"
            desc="Full exam-style tests, graded on the server the moment you submit."
            tone="reading"
          />
          <Feature
            href="/listening"
            icon={<Headphones />}
            title="Listening"
            desc="Audio tests scored automatically, with history and best-band tracking."
            tone="listening"
          />
          <Feature
            href="/register?next=%2Fspeaking"
            icon={<Mic />}
            title="Speaking"
            desc="Practise real Part 1-3 questions and record your answers."
            tone="speaking"
          />
          <Feature
            href="/register?next=%2Fwriting"
            icon={<PenLine />}
            title="Writing"
            desc="Real Task 1 and Task 2 questions in the exam layout, with a timer and word count."
            tone="writing"
          />
        </section>

        {/* ---- Mock exam + Premium ---- */}
        <h2 className={`pt-12 text-center ${EYEBROW_BASE} text-muted`}>
          When you want more
        </h2>
        <section className="grid gap-4 pt-4 lg:grid-cols-2">
          <Link
            href="/register?next=%2Fmock"
            className="group flex items-start gap-4 rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-semibold">
                Full mock exams
                <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm text-muted">
                Listening, Reading and Writing in one timed sitting, marked by a teacher, with
                your result and paper review sent to you.
              </span>
            </span>
          </Link>
          <Link
            href="/premium"
            className="group flex items-start gap-4 rounded-2xl border border-premium/30 bg-premium/5 p-6 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-premium-gradient text-white">
              <Crown className="h-5 w-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-semibold">
                Premium from {PREMIUM_PLANS[0].price}
                <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-sm text-muted">
                Every premium test and instant mock exam entry. {PREMIUM_PLANS.map((p) => `${p.price} for ${p.label}`).join(", ")}.
              </span>
            </span>
          </Link>
        </section>

        {/* ---- Feature deep-dive ---- */}
        <section className="pt-20 sm:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className={EYEBROW}>Everything in one place</p>
            <h2 className={`mt-3 ${H2}`}>
              Built to feel like the real exam
            </h2>
            <p className="mt-3 text-muted">
              Not a quiz app — a full practice system that scores you honestly and shows
              you exactly what to fix next.
            </p>
          </div>

          {/* Two detail rows, image on alternate sides. Each picture is a zoomed
              region of a full capture (see Detail), so the reader sees the
              thing the text is about rather than a whole small screen. */}
          <div className="mt-14 space-y-14 sm:mt-20 sm:space-y-24">
            <DetailRow
              title="Listening that runs like the exam"
              desc="The recording plays across the top while you type your answers, with all four parts in one sitting — the same way the computer-delivered test runs."
            >
              <Detail
                name="listening"
                alt="The listening player: the audio bar across the top and the first note-completion questions."
                x={0}
                y={0.056}
                zoom={1.667}
              />
            </DetailRow>

            <DetailRow
              flip
              title="Honest server-side scoring"
              desc="Reading and Listening are graded on the server against a hidden answer key the instant you submit — scores can't be faked, so your band actually means something. You see your band, your score, and every question marked against the official answer, with what you should have written."
            >
              <Detail
                name="report"
                alt="A finished score report: band 7.5, 11 of 14 correct, and each answer marked right or wrong."
                x={0.1975}
                y={0.228}
                zoom={1.905}
              />
            </DetailRow>
          </div>

          {/* The three features with no picture of their own: plain text
              between hairlines, not cards. */}
          <ul className="mt-14 border-t border-border sm:mt-20 sm:grid sm:grid-cols-3 sm:border-b">
            <Point
              title="Real Writing questions"
              desc="Hundreds of Task 1 and Task 2 questions reported from recent exams, in the exam's own split-screen layout with a timer and a live word count."
            />
            <Point
              title="Know your weak spots"
              desc="Per-question-type analytics pinpoint where you lose marks and recommend the exact tests to fix them — true/false, matching headings, maps, and more."
            />
            <Point
              title="Weekly progress reports"
              desc="Every week you get a digest: tests done, average band, rating change and new achievements — delivered to your in-app inbox so you stay accountable."
            />
          </ul>
        </section>

        {/* ---- How it works ---- */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className={EYEBROW}>How it works</p>
            <h2 className={`mt-3 ${H2}`}>
              From first test to target band
            </h2>
            <p className="mt-3 text-muted">
              A simple loop that compounds: practise, get scored, see exactly what to fix.
            </p>
          </div>

          <ol className="mt-12 border-t border-border sm:grid sm:grid-cols-3 sm:border-b">
            <Step
              n="01"
              title="Take a real test"
              desc="Exam-format Reading, Listening and Speaking — the same timing and question types you'll face on test day."
            />
            <Step
              n="02"
              title="Get scored instantly"
              desc="Reading and Listening are graded on the server the moment you submit — no waiting, no guesswork."
            />
            <Step
              n="03"
              title="Climb the leaderboard"
              desc="A rating that grows with every rated test, streaks, badges and weekly reports keep you accountable."
            />
          </ol>
        </section>

        {/* ---- Rank ladder ---- */}
        <section className="pb-20 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 shadow-soft sm:p-12">
            <div className="relative grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <p className={EYEBROW}>Competitive ranking</p>
                <h2 className={`mt-3 ${H2}`}>
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
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5"
                  >
                    <RankBadge tier={tier} size="sm" className="h-9 w-9" />
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
            <h2 className={H2}>
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
            <div className="relative">
              <Zap className="mx-auto h-8 w-8 text-white/90" />
              <h2 className={`mx-auto mt-4 max-w-xl ${H2}`}>
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
                <Logo size={24} /> {SITE_NAME}
              </span>
              <p className="mt-2 text-sm text-muted">
                Real exam-style practice with instant band scores and a competitive
                ranking that keeps you coming back.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <Link href="/register" className="text-muted transition-colors hover:text-foreground">
                Get started
              </Link>
              <Link href="/login" className="text-muted transition-colors hover:text-foreground">
                Sign in
              </Link>
              <Link href="/reading" className="text-muted transition-colors hover:text-foreground">
                Reading
              </Link>
              <Link href="/listening" className="text-muted transition-colors hover:text-foreground">
                Listening
              </Link>
              <Link href="/register" className="text-muted transition-colors hover:text-foreground">
                Speaking
              </Link>
              <a
                href={CONTACT_TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="text-muted transition-colors hover:text-foreground"
              >
                Contact us
              </a>
              <Link href="/premium" className="text-muted transition-colors hover:text-foreground">
                Premium
              </Link>
              <Link href="/privacy" className="text-muted transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="text-muted transition-colors hover:text-foreground">
                Terms
              </Link>
            </nav>
          </div>
          <div className="mt-8 border-t border-border/60 pt-6 text-center text-sm text-muted">
            © {new Date().getFullYear()} {SITE_NAME}. Practise daily, test confidently.
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * A product screenshot, in the viewer's theme.
 *
 * Two <Image>s rather than one swapped at runtime: the hidden variant sits
 * inside a `display: none` wrapper, so its lazy fetch never fires and each
 * visitor downloads one PNG, not two. Doing this with `useTheme()` instead
 * would make the page's largest element wait for hydration.
 *
 * Captured by `npm run shots` (scripts/capture-screenshots.mjs) at 2160×1350.
 */
function Shot({ name, alt }: { name: "player" | "listening" | "report"; alt: string }) {
  const common = {
    width: 2160,
    height: 1350,
    sizes: "(min-width: 1024px) 960px, 100vw",
    className: "h-auto w-full",
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-soft">
      <div className="dark:hidden">
        {/* Both variants are lazy on purpose. `display: none` suppresses a
            LAZY fetch but not an eager one and not a `priority` preload — with
            either of those a dark-mode visitor also downloaded the light PNG.
            A lazy image that is already in the viewport still loads straight
            away, so light mode gives up nothing. */}
        <Image src={`/shots/${name}-light.png`} alt={alt} loading="lazy" {...common} />
      </div>
      <div className="hidden dark:block">
        {/* Same picture, so it is decorative to a screen reader. */}
        <Image src={`/shots/${name}-dark.png`} alt="" aria-hidden loading="lazy" {...common} />
      </div>
    </div>
  );
}

// One accent per skill, from the --skill-* tokens in globals.css (each has a
// light and a dark value, so no `dark:` variants are needed here).
const tones = {
  reading: {
    chip: "bg-skill-reading/10 text-skill-reading group-hover:bg-skill-reading/15",
    edge: "from-skill-reading/60",
  },
  listening: {
    chip: "bg-skill-listening/10 text-skill-listening group-hover:bg-skill-listening/15",
    edge: "from-skill-listening/60",
  },
  speaking: {
    chip: "bg-skill-speaking/10 text-skill-speaking group-hover:bg-skill-speaking/15",
    edge: "from-skill-speaking/60",
  },
  writing: {
    chip: "bg-skill-writing/10 text-skill-writing group-hover:bg-skill-writing/15",
    edge: "from-skill-writing/60",
  },
} as const;

function Feature({
  icon,
  title,
  desc,
  badge,
  tone,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  tone: keyof typeof tones;
  // Omitted for a skill that has nowhere to send anyone yet (Writing). A card
  // that promises a page and delivers "coming soon" is worse than one that
  // doesn't move.
  href?: string;
}) {
  const t = tones[tone];
  const base =
    "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-300";
  const body = (
    <>
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
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
      {href && (
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          Start now <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );

  if (!href) return <div className={base}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${base} hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-glow)]`}
    >
      {body}
    </Link>
  );
}

/** Text beside a picture. `flip` puts the picture first on desktop; on a
 *  phone the text always comes first. */
function DetailRow({
  title,
  desc,
  flip,
  children,
}: {
  title: string;
  desc: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : undefined}>
        <h3 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.015em] sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 text-pretty leading-relaxed text-muted">{desc}</p>
      </div>
      <div className={flip ? "lg:order-1" : undefined}>{children}</div>
    </div>
  );
}

/** A feature as plain text between hairlines — the Step layout without a numeral. */
function Point({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="border-b border-border py-7 sm:border-b-0 sm:border-l sm:px-7 sm:py-9 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
    </li>
  );
}

/**
 * One step of "How it works". Deliberately NOT a card: a large numeral, a
 * title and one line, separated by hairlines. Nothing here is clickable, so
 * nothing lifts on hover. Stacked rows on a phone, three columns from `sm`.
 */
function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <li className="flex gap-5 border-b border-border py-7 sm:block sm:border-b-0 sm:border-l sm:px-7 sm:py-9 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
      <span
        aria-hidden
        className="font-display text-5xl font-semibold tabular-nums leading-none tracking-[-0.03em] text-primary sm:text-6xl"
      >
        {n}
      </span>
      <div className="sm:mt-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
      </div>
    </li>
  );
}
