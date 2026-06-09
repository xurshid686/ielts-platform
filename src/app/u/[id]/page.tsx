import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GraduationCap, Trophy, Target, CheckCircle2, CalendarDays, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { RankBadge } from "@/components/rating/rank-badge";
import { RatingTrend, type RatingPoint } from "@/components/dashboard/rating-trend";
import { ShareButton } from "@/components/share-button";
import { tierForRating, ratingProgress, estimatedBand } from "@/lib/rating";
import type { PublicProfile } from "@/types/database";

async function fetchProfile(id: string): Promise<PublicProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_profile", { p_id: id });
  if (error || !data) return null;
  return data as PublicProfile;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await fetchProfile(id);
  if (!p) return { title: "Profile" };
  const tier = tierForRating(p.rating);
  const title = `${p.name || "A student"} · ${tier.label} ${p.rating} — IELTS`;
  const description = `Reading rating ${p.rating} (${tier.label})${
    p.global_rank ? `, ranked #${p.global_rank} globally` : ""
  }. ${p.tests_completed} tests completed. Practise IELTS and climb the leaderboard.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await fetchProfile(id);
  if (!p) notFound();

  const tier = tierForRating(p.rating);
  const progress = ratingProgress(p.rating);
  const points: RatingPoint[] = p.history.map((h) => ({ rating: h.r, at: h.at }));
  const memberSince = new Date(p.member_since).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Slim public header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white">
            <GraduationCap className="h-5 w-5" />
          </span>
          IELTS
        </Link>
        <Link
          href="/register"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Start practising
        </Link>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 lg:py-12">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-elevated sm:p-8">
          <div className="ring-hairline absolute inset-0 rounded-2xl" />
          <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Google avatar
              <img
                src={p.avatar_url}
                alt=""
                className="h-20 w-20 rounded-full object-cover ring-4 ring-white/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-3xl font-bold">
                {(p.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{p.name || "Anonymous student"}</h1>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                  {tier.emoji} {tier.label}
                </span>
                <span className="text-2xl font-extrabold tabular-nums">{p.rating}</span>
                {p.global_rank && (
                  <span className="inline-flex items-center gap-1 text-sm text-white/85">
                    <Sparkles className="h-4 w-4" /> Global #{p.global_rank}
                  </span>
                )}
              </div>
              {progress.next && (
                <div className="mt-3 max-w-xs">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-white/80">
                    {progress.toNext} to {progress.next.label}
                  </p>
                </div>
              )}
            </div>
            <RankBadge rating={p.rating} size="lg" className="hidden sm:flex" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat icon={<Trophy />} label="Peak rating" value={`${p.peak_rating}`} />
          <Stat icon={<CheckCircle2 />} label="Tests done" value={`${p.tests_completed}`} />
          <Stat
            icon={<Target />}
            label="Best band"
            value={p.best_band != null ? p.best_band.toFixed(1) : "—"}
          />
          <Stat icon={<CalendarDays />} label="Member since" value={memberSince} />
        </div>

        <p className="text-center text-sm text-muted">≈ Band {estimatedBand(p.rating)} reading level</p>

        {/* Rating history */}
        {points.length >= 2 && <RatingTrend points={points} />}

        {/* Achievements */}
        {p.achievements.length > 0 && (
          <Card>
            <h2 className="mb-3 text-sm font-medium text-muted">
              Achievements · {p.achievements.length}
            </h2>
            <div className="flex flex-wrap gap-2">
              {p.achievements.map((a) => (
                <span
                  key={a.id}
                  title={`${a.name} · ${new Date(a.earned_at).toLocaleDateString()}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-sm"
                >
                  <span className="text-base">{a.icon}</span>
                  <span className="text-xs font-medium">{a.name}</span>
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Share + CTA */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <ShareButton label="Share profile" />
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Trophy className="h-4 w-4" /> View leaderboard
          </Link>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex flex-col justify-center">
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
