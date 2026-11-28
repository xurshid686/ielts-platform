import { Suspense } from "react";
import { Flame } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/premium";
import { loadDashboard, todayView } from "@/lib/dashboard-data";
import { estimatedOverall, skillSnapshot, streakAtRisk } from "@/lib/dashboard-shared";
import { groupOf, myInvites } from "@/lib/friends";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { TodayCard } from "@/components/dashboard/today-card";
import { PassesCard } from "@/components/dashboard/passes-card";
import { SkillsSnapshot } from "@/components/dashboard/skills-snapshot";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { MockStatusCard } from "@/components/dashboard/mock-status-card";
import { WritingReportsCard } from "@/components/dashboard/writing-reports-card";
import { TrialOffer } from "@/components/premium/trial-offer";
import { TelegramDailyCard } from "@/components/premium/telegram-daily-card";
import { InviteBanner } from "@/components/premium/invite-banner";
import { MyGroupCard } from "@/components/premium/my-group-card";

// The student dashboard is "Today" (owner, 2026-11-28): ONE test to do today, picked by
// lib/today-pick.ts (the same pick as the 10:00 Telegram message), then the weekly free
// Premium tests, the bands at a glance and whatever needs attention. Every chart and
// statistic the old one-page dashboard had lives on /dashboard/progress.
//
// Speed: one Promise.all (lib/dashboard-data.ts); the cards that need their own reads
// (mock, Friends, Telegram) stream in under <Suspense> and never hold up the Today card.

export default async function DashboardPage() {
  const profile = await requireProfile();
  const d = await loadDashboard(profile);
  const today = todayView(profile, d);

  const first = d.results.length === 0;
  const atRisk = streakAtRisk(profile.streak, today.practisedToday);
  const snap = skillSnapshot(d.results, d.writingBand);
  const overall = estimatedOverall(snap).band;
  const firstName = profile.name?.trim().split(/\s+/)[0] || "there";
  // The one-time trial: never had Premium or a trial, has finished something (trialEligible's
  // rule, answered from data this page already holds instead of two more queries).
  const offerTrial = !d.member && !profile.premium_until && !d.hadTrial && !first;

  const titles = new Map(d.catalogue.map((t) => [t.id, t.title]));
  const recent = d.results.slice(0, 3).map((r) => ({
    id: r.id,
    skill: r.skill,
    title: r.test_id ? (titles.get(r.test_id) ?? null) : null,
    band: r.band != null ? Number(r.band) : null,
    raw: r.raw,
    total: r.total,
    at: r.submitted_at,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {today.greeting}, {firstName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {profile.streak > 0 ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${
                  atRisk ? "bg-warning/12 text-warning" : "bg-primary/10 text-primary"
                }`}
              >
                <Flame className="h-4 w-4" />
                {profile.streak}-day streak{atRisk ? ": practise today to keep it" : ""}
              </span>
            ) : (
              <span className="text-muted">
                {first
                  ? "One test and this page fills in with your band and what to practise next."
                  : today.practisedToday
                    ? "Good work today. Come back tomorrow to start a streak."
                    : "Do today's test to start a streak."}
              </span>
            )}
          </div>
        </div>
        <DashboardTabs active="today" />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <TodayCard
            day={today.day}
            first={first}
            pick={today.pick}
            doneBands={today.doneToday.map((r) => (r.band != null ? Number(r.band) : null))}
            passesLeft={d.passes?.left ?? null}
            streak={profile.streak}
          />
          {offerTrial && <TrialOffer days={TRIAL_DAYS} />}
          {d.passes && <PassesCard left={d.passes.left} tests={today.passPicks} />}
        </div>

        <div className="space-y-6">
          {!first && <SkillsSnapshot skills={snap} overall={overall} target={profile.target_band} />}
          <Suspense fallback={null}>
            <MockStatusCard userId={profile.id} />
          </Suspense>
          <Suspense fallback={null}>
            <FriendsSlot userId={profile.id} />
          </Suspense>
          <Suspense fallback={null}>
            <TelegramDailyCard userId={profile.id} />
          </Suspense>
          {!first && (
            <RecentActivity items={recent} total={d.results.length} more={{ href: "/dashboard/progress", label: "All your progress" }} />
          )}
          <WritingReportsCard reports={d.reports} />
        </div>
      </div>
    </div>
  );
}

/** The Friends group card, or the invitation banner (0078). Its own reads, streamed. */
async function FriendsSlot({ userId }: { userId: string }) {
  const [group, invites] = await Promise.all([groupOf(userId).catch(() => null), myInvites(userId).catch(() => [])]);
  return group ? <MyGroupCard group={group} me={userId} /> : <InviteBanner invites={invites} />;
}
