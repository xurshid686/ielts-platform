import { Detail } from "@/components/landing/detail";
import { getSiteStats, type SiteStats } from "@/lib/site-stats";

// The landing page's type scale (src/app/page.tsx), one step smaller: this is
// half a screen, not a full one.
const EYEBROW = "text-xs font-semibold uppercase tracking-[0.14em] text-primary";
const HEADLINE =
  "mt-3 text-balance font-display text-[2rem] font-semibold leading-[1.1] tracking-[-0.02em] xl:text-[2.5rem]";

/** The library's live size. A zero is left out: "0 tests" is worse than no figure. */
function figuresOf(stats: SiteStats | null) {
  if (!stats) return [];
  return [
    { n: stats.reading, label: "Reading tests" },
    { n: stats.listening, label: "Listening tests" },
    { n: stats.task2, label: "Task 2 questions" },
    { n: stats.task1, label: "Task 1 charts" },
  ].filter((f) => f.n > 0);
}

/**
 * /register — the full case for an account, made with proof: what a guest
 * loses, a real saved report, and the size of the library.
 */
export async function RegisterPanel() {
  const figures = figuresOf(await getSiteStats());
  return (
    <div>
      <p className={EYEBROW}>A free account</p>
      <p className={HEADLINE}>Keep every score. See every answer marked.</p>
      <p className="mt-4 text-pretty leading-relaxed text-muted">
        A guest&apos;s result is gone when the tab closes. An account saves each attempt, shows
        every answer beside the correct one, and tracks your band from test to test.
      </p>

      {/* Dropped on a short laptop screen so the panel never outgrows the viewport. */}
      <div className="mt-6 [@media(max-height:719px)]:hidden">
        <Detail
          name="report"
          alt="A saved score report: band 7.5, 11 of 14 correct, and each answer marked right or wrong."
          x={0.1975}
          y={0.228}
          zoom={1.905}
          ratio={16 / 9}
          frameWidth={480}
        />
      </div>

      {figures.length >= 2 && (
        <dl className="mt-6 flex border-y border-border">
          {figures.map((f) => (
            <div
              key={f.label}
              className="flex flex-1 flex-col-reverse justify-end border-l border-border px-3 py-3.5 first:border-l-0 first:pl-0"
            >
              <dt className="mt-1 text-xs leading-snug text-muted">{f.label}</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums tracking-[-0.02em] xl:text-3xl">
                {f.n.toLocaleString("en-US")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * /login — a returning student needs no persuading, so no screenshot and no
 * argument: one line about what is waiting, and the library as it stands today.
 */
export async function LoginPanel() {
  const figures = figuresOf(await getSiteStats());
  return (
    <div>
      <p className={EYEBROW}>Your account</p>
      <p className={HEADLINE}>Your scores are where you left them.</p>
      <p className="mt-4 text-pretty leading-relaxed text-muted">
        Every saved attempt, its answer review and your band history are on your dashboard.
      </p>

      {figures.length >= 2 && (
        <>
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            The library today
          </p>
          <dl className="mt-3 grid grid-cols-2 border-y border-border">
            {figures.map((f, i) => (
              <div
                key={f.label}
                className={`flex flex-col-reverse justify-end py-5 ${
                  i % 2 === 1 ? "border-l border-border pl-6" : "pr-6"
                } ${i >= 2 ? "border-t border-border" : ""}`}
              >
                <dt className="mt-1 text-sm text-muted">{f.label}</dt>
                <dd className="font-display text-4xl font-semibold tabular-nums tracking-[-0.02em] xl:text-5xl">
                  {f.n.toLocaleString("en-US")}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

const RESET_STEPS = [
  {
    title: "Enter your email",
    desc: "We send a link to set a new password. It lasts one hour.",
  },
  {
    title: "Open the link in this browser",
    desc: "For security, a link opened in a different browser cannot finish the reset.",
  },
  {
    title: "Choose a new password",
    desc: "Your results, rating and streak stay exactly as they are. Other devices are signed out.",
  },
];

/**
 * /forgot-password and /reset-password — nothing to sell. The three steps of
 * the reset, in the landing page's numbered-row style, with the step this
 * page performs marked. No data is read, so /reset-password stays static.
 */
export function ResetPanel({ step }: { step: 1 | 3 }) {
  return (
    <div>
      <p className={EYEBROW}>Password reset</p>
      <p className={HEADLINE}>Three steps, and nothing else changes.</p>

      <ol className="mt-8 border-t border-border">
        {RESET_STEPS.map((s, i) => {
          const current = i + 1 === step;
          return (
            <li
              key={s.title}
              aria-current={current ? "step" : undefined}
              className="flex gap-5 border-b border-border py-5"
            >
              <span
                aria-hidden
                className={`w-12 shrink-0 font-display text-4xl font-semibold tabular-nums leading-none tracking-[-0.03em] ${
                  current ? "text-primary" : "text-muted"
                }`}
              >
                0{i + 1}
              </span>
              <div>
                <p className="font-semibold">
                  {s.title}
                  {current && <span className="sr-only"> (this step)</span>}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.desc}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
