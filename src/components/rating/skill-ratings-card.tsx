import Link from "next/link";
import { ArrowRight, BookOpen, Headphones, PenLine, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RankBadge } from "@/components/rating/rank-badge";
import { SKILL_LABEL, WRITING_MIN_ESSAYS, tierForRating, type Skill } from "@/lib/rating";
import type { SkillRatings } from "@/lib/skill-ratings";
import { cn } from "@/lib/utils";

const ICON: Record<Skill, typeof BookOpen> = { reading: BookOpen, listening: Headphones, writing: PenLine };
const HOW: Record<Skill, string> = {
  reading: "Take a reading test",
  listening: "Take a listening test",
  writing: `Get ${WRITING_MIN_ESSAYS} essays checked`,
};
const HREF: Record<Skill, string> = { reading: "/reading", listening: "/listening", writing: "/writing" };

/** Overall + one tile per skill (0079). A skill not rated yet says how to get rated. */
export function SkillRatingsCard({ data, compact = false }: { data: SkillRatings; compact?: boolean }) {
  return (
    <Card className="space-y-4" aria-label="Skill ratings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-muted">Overall rating</p>
          <p className="flex items-end gap-2 leading-none">
            <span className="text-3xl font-extrabold tabular-nums">{data.overall ?? "—"}</span>
            {data.overall != null && (
              <span className="mb-0.5 text-sm font-semibold text-muted">{tierForRating(data.overall).label}</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            Average of {compact ? "" : "your "}rated skills · {data.rated} of 3
            {data.overallRank != null && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> #{data.overallRank}
              </span>
            )}
          </p>
        </div>
        {!compact && (
          <Link href="/leaderboard" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Leaderboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {data.skills.map((s) => {
          const Icon = ICON[s.skill];
          const tier = tierForRating(s.rating);
          return (
            <div
              key={s.skill}
              data-skill={s.skill}
              className={cn("flex items-center gap-3 rounded-xl border border-border p-3", !s.counts && "bg-surface-2/50")}
            >
              {s.counts ? (
                <RankBadge tier={tier} size="sm" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted">
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">{SKILL_LABEL[s.skill]}</p>
                {s.counts ? (
                  <p className="text-sm font-semibold tabular-nums">
                    {s.rating} <span className="font-normal text-muted">{tier.label}</span>
                  </p>
                ) : compact ? (
                  <p className="text-xs text-muted">
                    {s.skill === "writing" && s.count > 0 ? `${s.count} of ${WRITING_MIN_ESSAYS} essays` : "Not rated yet"}
                  </p>
                ) : (
                  <Link href={HREF[s.skill]} className="text-xs font-medium text-primary hover:underline">
                    {s.skill === "writing" && s.count > 0
                      ? `${s.count} of ${WRITING_MIN_ESSAYS} essays checked`
                      : HOW[s.skill]}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
