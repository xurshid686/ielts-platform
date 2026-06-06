import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, BookOpen, Headphones, PenLine, Mic, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in users skip the marketing page and go straight to their dashboard.
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="h-6 w-6 text-primary" /> IELTS Practice
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 text-center sm:py-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted">
            <Flame className="h-4 w-4 text-warning" /> Build a daily streak. Hit your band.
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Practice IELTS the way you{" "}
            <span className="text-brand-gradient">actually test</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Reading, Listening and Speaking in one place — real tests, instant
            scoring, and a live AI examiner you can actually talk to. Automatic
            progress tracking and a streak system keep you practising every day.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">Start practising free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<BookOpen />} title="Reading" desc="Full exam-style tests, graded on the server the moment you submit." />
          <Feature icon={<Headphones />} title="Listening" desc="Audio tests scored automatically, with history and best-band tracking." />
          <Feature icon={<Mic />} title="Speaking" desc="Talk live with an AI examiner, or record a full mock for band feedback." badge="New" />
          <Feature icon={<PenLine />} title="Writing" desc="Task 1 & 2 editor with AI band feedback." badge="Soon" />
        </section>
      </main>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <div className="group rounded-2xl border border-border bg-surface p-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          {icon}
        </div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}
