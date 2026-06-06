import Link from "next/link";
import {
  Flame,
  Trophy,
  Zap,
  CheckCircle2,
  BookOpen,
  Headphones,
  PenLine,
  Mic,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { avg, timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { Result } from "@/types/database";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: results } = await supabase
    .from("results")
    .select("*")
    .eq("user_id", profile.id)
    .order("submitted_at", { ascending: false });

  const all = (results ?? []) as Result[];
  const bands = (skill: string) =>
    all.filter((r) => r.skill === skill && r.band != null).map((r) => Number(r.band));

  const readingAvg = avg(bands("reading"));
  const listeningAvg = avg(bands("listening"));
  const writingCount = all.filter((r) => r.skill === "writing").length;
  const speakingCount = all.filter((r) => r.skill === "speaking").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Hi {profile.name?.split(" ")[0] || "there"} 👋</h1>
        <p className="text-muted">Here&apos;s your progress. Keep the streak alive!</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<Flame className="text-warning" />} label="Current streak" value={`${profile.streak} 🔥`} />
        <Stat icon={<Trophy className="text-warning" />} label="Longest streak" value={`${profile.longest_streak}`} />
        <Stat icon={<Zap className="text-primary" />} label="XP points" value={`${profile.xp}`} />
        <Stat icon={<CheckCircle2 className="text-success" />} label="Tests completed" value={`${all.length}`} />
      </div>

      {/* Skill overview */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Skill progress</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkillCard
            href="/reading"
            icon={<BookOpen className="h-5 w-5" />}
            title="Reading"
            metric={readingAvg != null ? `Band ${readingAvg}` : "No tests yet"}
            sub={`${bands("reading").length} tests`}
          />
          <SkillCard
            href="/listening"
            icon={<Headphones className="h-5 w-5" />}
            title="Listening"
            metric={listeningAvg != null ? `Band ${listeningAvg}` : "No tests yet"}
            sub={`${bands("listening").length} tests`}
          />
          <SkillCard
            href="/writing"
            icon={<PenLine className="h-5 w-5" />}
            title="Writing"
            metric={`${writingCount} submissions`}
            sub="Task 1 & 2"
          />
          <SkillCard
            href="/speaking"
            icon={<Mic className="h-5 w-5" />}
            title="Speaking"
            metric={`${speakingCount} submissions`}
            sub="Recorded answers"
          />
        </div>
      </section>

      {/* Recent results */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent results</h2>
        <Card className="p-0">
          {all.length === 0 ? (
            <div className="p-8 text-center text-muted">
              No results yet.{" "}
              <Link href="/reading" className="font-medium text-primary hover:underline">
                Take your first test →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {all.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <SkillDot skill={r.skill} />
                    <div>
                      <p className="text-sm font-medium capitalize">{r.skill}</p>
                      <p className="text-xs text-muted">{timeAgo(r.submitted_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {r.band != null && <p className="font-semibold">Band {Number(r.band)}</p>}
                    {r.raw != null && r.total != null && (
                      <p className="text-xs text-muted">
                        {r.raw}/{r.total}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Card>
  );
}

function SkillCard({
  href,
  icon,
  title,
  metric,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  metric: string;
  sub: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <ArrowRight className="h-4 w-4 text-muted" />
        </div>
        <h3 className="mt-3 font-semibold">{title}</h3>
        <p className="text-sm text-foreground">{metric}</p>
        <p className="text-xs text-muted">{sub}</p>
      </Card>
    </Link>
  );
}

function SkillDot({ skill }: { skill: string }) {
  const map: Record<string, string> = {
    reading: "bg-indigo-500",
    listening: "bg-teal-500",
    writing: "bg-amber-500",
    speaking: "bg-rose-500",
  };
  return <span className={`h-2.5 w-2.5 rounded-full ${map[skill] ?? "bg-slate-400"}`} />;
}
