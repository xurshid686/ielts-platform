import Link from "next/link";
import { CheckCircle2, Circle, Target, BookOpen, Mic, Sparkles, ArrowRight } from "lucide-react";

type Step = {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  done: boolean;
  cta: string;
};

// Guided first-session checklist. Rendered only while the user has completed
// zero tests, so it disappears on its own once they get going.
export function Onboarding({ targetSet, spoke }: { targetSet: boolean; spoke: boolean }) {
  const steps: Step[] = [
    {
      icon: <Target className="h-5 w-5" />,
      title: "Set your target band",
      desc: "Tell us what you're aiming for and we'll track the gap per skill.",
      href: "#goal",
      done: targetSet,
      cta: "Set goal",
    },
    {
      icon: <BookOpen className="h-5 w-5" />,
      title: "Take your first Reading test",
      desc: "A real exam-style passage, graded the moment you submit.",
      href: "/reading",
      done: false,
      cta: "Browse tests",
    },
    {
      icon: <Mic className="h-5 w-5" />,
      title: "Meet your AI examiner",
      desc: "Have a live speaking conversation and get band feedback.",
      href: "/speaking",
      done: spoke,
      cta: "Try speaking",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-surface p-6 shadow-soft">
      <div className="orb -right-16 -top-20 h-56 w-56 bg-primary/10" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Welcome! Let&apos;s get you set up
          </h2>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums">
            {doneCount} of {steps.length} done
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <Link
              key={s.title}
              href={s.href}
              className={`group flex flex-col rounded-xl border p-4 transition-all duration-200 ${
                s.done
                  ? "border-success/30 bg-success/5"
                  : "border-border bg-surface-2/50 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    s.done ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
                  }`}
                >
                  {s.icon}
                </span>
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <Circle className="h-5 w-5 text-border" />
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">{s.title}</p>
              <p className="mt-0.5 flex-1 text-xs leading-relaxed text-muted">{s.desc}</p>
              {!s.done && (
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  {s.cta}
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
