import Link from "next/link";
import { GraduationCap, BookOpen, Headphones, PenLine, Mic, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="h-6 w-6 text-primary" /> IELTS Practice
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <Button asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 text-center sm:py-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted">
            <Flame className="h-4 w-4 text-warning" /> Build a daily streak. Hit your band.
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Practice IELTS the way you{" "}
            <span className="text-primary">actually test</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Reading, Listening, Writing and Speaking in one place. Real tests,
            instant scoring, automatic progress tracking, and a streak system
            that keeps you practising every day.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href={user ? "/dashboard" : "/register"}>
                {user ? "Go to dashboard" : "Start practising free"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<BookOpen />} title="Reading" desc="Full HTML tests with instant scoring and history." />
          <Feature icon={<Headphones />} title="Listening" desc="Audio tests scored automatically as you submit." />
          <Feature icon={<PenLine />} title="Writing" desc="Task 1 & 2 editor with drafts and AI feedback." />
          <Feature icon={<Mic />} title="Speaking" desc="Record answers and get fluency feedback." />
        </section>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}
