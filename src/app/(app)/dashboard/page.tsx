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
import { BandTrend, type BandPoint } from "@/components/dashboard/band-trend";
import type { Result, SpeakingSubmission } from "@/types/database";

type Activity = {
  id: string;
  skill: string;
  band: number | null;
  raw: number | null;
  total: number | null;
  at: string;
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Reading / listening live in `results`; speaking lives in `speaking_submissions`.
  const [{ data: results }, { data: speaking }] = await Promise.all([
    supabase
      .from("results")
      .select("*")
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("speaking_submissions")
      .select("id, score, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  const all = (results ?? []) as Result[];
  const speak = (speaking ?? []) as Pick<SpeakingSubmission, "id" | "score" | "created_at">[];

  const bands = (skill: string) =>
    all.filter((r) => r.skill === skill && r.band != null).map((r) => Number(r.band));

  const readingAvg = avg(bands("reading"));
  const listeningAvg = avg(bands("listening"));
  const speakingBands = speak.filter((s) => s.score != null).map((s) => Number(s.score));
  const speakingAvg = avg(speakingBands);

  const totalCompleted = all.length + speak.length;

  // Reading band history as a chronological series (oldest first) for the trend.
  const readingSeries: BandPoint[] = all
    .filter((r) => r.skill === "reading" && r.band != null)
    .slice(0, 12)
    .reverse()
    .map((r) => ({ band: Number(r.band), at: r.submitted_at }));

  // Unified recent activity across all skills.
  const activity: Activity[] = [
    ...all.map((r) => ({
      id: r.id,
      skill: r.skill,
      band: r.band != null ? Number(r.band) : null,
      raw: r.raw,
      total: r.total,
      at: r.submitted_at,
    })),
    ...speak.map((s) => ({
      id: s.id,
      skill: "speaking",
      band: s.score != null ? Number(s.score) : null,
      raw: null,
      total: null,
      at: s.created_at,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hi {profile.name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="text-muted">Here&apos;s your progress. Keep the streak alive!</p>
      </div>

      {/* Streak hero + key stats */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-elevated">
          <div className="ring-hairline absolute inset-0 rounded-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-medium text-white/85">
              <Flame className="h-4 w-4" /> Current streak
            </div>
            <p className="mt-2 flex items-end gap-2 text-5xl font-extrabold tabular-nums">
              {profile.streak}
              <span className="mb-1 text-2xl">🔥</span>
            </p>
            <p className="mt-1 text-sm text-white/80">
              {profile.streak > 0 ? "Come back tomorrow to keep it going." : "Take a test today to start your streak."}
            </p>
            <div className="mt-5 flex gap-6 text-sm">
              <span className="flex items-center gap-1.5 text-white/90">
                <Trophy className="h-4 w-4" /> Best{" "}
                <strong className="tabular-nums">{profile.longest_streak}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-white/90">
                <Zap className="h-4 w-4" /> <strong className="tabular-nums">{profile.xp}</strong> XP
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Stat icon={<Trophy className="text-warning" />} label="Longest streak" value={`${profile.longest_streak}`} />
          <Stat icon={<Zap className="text-primary" />} label="XP points" value={`${profile.xp}`} />
          <Stat icon={<CheckCircle2 className="text-success" />} label="Completed" value={`${totalCompleted}`} />
          <Stat icon={<Mic className="text-accent" />} label="Speaking" value={`${speak.length}`} />
        </div>
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
            href="/speaking"
            icon={<Mic className="h-5 w-5" />}
            title="Speaking"
            metric={speakingAvg != null ? `Band ${speakingAvg}` : `${speak.length} sessions`}
            sub={speak.length ? `${speak.length} sessions` : "Talk live with AI"}
          />
          <SkillCard
            href="/writing"
            icon={<PenLine className="h-5 w-5" />}
            title="Writing"
            metric="Coming soon"
            sub="Task 1 & 2"
          />
        </div>
      </section>

      {/* Reading band trend */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Your trend</h2>
        <BandTrend points={readingSeries} />
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <Card className="overflow-hidden p-0">
          {activity.length === 0 ? (
            <div className="p-8 text-center text-muted">
              No activity yet.{" "}
              <Link href="/reading" className="font-medium text-primary hover:underline">
                Take your first test →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-2/60"
                >
                  <div className="flex items-center gap-3">
                    <SkillDot skill={a.skill} />
                    <div>
                      <p className="text-sm font-medium capitalize">{a.skill}</p>
                      <p className="text-xs text-muted">{timeAgo(a.at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {a.band != null && (
                      <p className="font-semibold tabular-nums">Band {a.band}</p>
                    )}
                    {a.raw != null && a.total != null && (
                      <p className="text-xs text-muted tabular-nums">
                        {a.raw}/{a.total}
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
    <Card className="flex flex-col justify-center">
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
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
    <Link href={href} className="group">
      <Card interactive className="h-full">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            {icon}
          </div>
          <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
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
