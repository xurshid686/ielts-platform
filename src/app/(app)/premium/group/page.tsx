import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Crown, Flame, Mail, Target, Trophy, Users, Zap } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { groupFeed, groupOf, myInvites, privacyOf, type FeedItem } from "@/lib/friends";
import { FRIENDS_SEATS } from "@/lib/site";
import { SKILL_LABEL, tierForRating } from "@/lib/rating";
import { RankBadge } from "@/components/rating/rank-badge";
import { InviteLink } from "@/components/premium/invite-link";
import {
  Avatar,
  CancelInvite,
  GroupName,
  InviteSearch,
  MemberActions,
  PrivacySwitches,
} from "@/components/friends/friends-client";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Friends group", robots: { index: false, follow: false } };

/** The site the person is on, so a dev-preview link stays on the dev preview. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mockonline.uz";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

/**
 * A Friends group (0077 + 0078), for the buyer and the members: name, seats,
 * invitations, the weekly goal, every friend with rating/streak/points, the
 * activity feed and privacy switches.
 */
export default async function GroupPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const profile = await requireProfile();
  const { joined } = await searchParams;
  const [group, invites] = await Promise.all([groupOf(profile.id), myInvites(profile.id)]);

  if (!group) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {invites.length > 0 && (
          <Link
            href="/premium/group/invites"
            className="flex items-center gap-3 rounded-2xl border border-premium/40 bg-premium/10 px-5 py-4 font-semibold"
          >
            <Mail className="h-5 w-5 text-premium" /> You have {invites.length} group{" "}
            {invites.length === 1 ? "invitation" : "invitations"} <ArrowRight className="ml-auto h-4 w-4" />
          </Link>
        )}
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
          <Users className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-2xl font-bold">You&apos;re not in a Friends group</h1>
          <p className="mt-2 text-muted">
            Friends gives Premium to you and up to {FRIENDS_SEATS - 1} friends. Or ask a friend to invite you.
          </p>
          <Link
            href="/premium"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white"
          >
            See the Friends plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const [feed, privacy, base] = await Promise.all([groupFeed(group), privacyOf(profile.id), origin()]);
  const isBuyer = group.owner_id === profile.id;
  const buyer = group.members.find((m) => m.is_owner);
  const invitedSeats = group.seats - 1; // the buyer's own seat isn't an invitation
  const accepted = group.members.length - 1;
  const pending = group.pending.length;
  const free = Math.max(0, group.seats - group.members.length - pending);
  const until = group.expires_at.slice(0, 10);
  const ranked = [...group.members].sort((a, b) => b.points_week - a.points_week || b.tests_week - a.tests_week);
  const goalPct = group.goal.target > 0 ? Math.min(100, Math.round((group.goal.done / group.goal.target) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {joined && (
        <div role="status" className="rounded-2xl border border-success/40 bg-success/10 px-5 py-4 text-sm">
          <b>You&apos;re in!</b> Premium is on until {until}. Every premium test is open to you now.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-premium">
            <Users className="h-3.5 w-3.5" /> Friends group
            <Link href="/premium/friends" className="ml-2 font-medium normal-case tracking-normal text-primary hover:underline">
              How Friends works
            </Link>
          </p>
          <GroupName groupId={group.id} name={group.name} canRename={isBuyer} />
          <p className="text-muted">
            {group.active ? (
              <>
                Premium for everyone until <b className="text-foreground">{until}</b>
                {!isBuyer && buyer && <> · bought by {buyer.name.split(/\s+/)[0]}</>}
              </>
            ) : (
              <>This group&apos;s Premium ended on {until}.</>
            )}
          </p>
        </div>
        {isBuyer && (
          <Link
            href="/premium?buy=friends&months=3"
            className="inline-flex items-center gap-2 rounded-xl border border-primary/50 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            <Crown className="h-4 w-4" /> {group.active ? "Add more time" : "Renew"}
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Seats meter */}
          <section aria-label="Seats" className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                <span data-testid="accepted">{accepted}</span> of {invitedSeats} invitations accepted
              </h2>
              <p className="text-sm text-muted">
                {pending > 0 && `${pending} pending · `}
                {free} {free === 1 ? "seat" : "seats"} free
              </p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2" aria-hidden>
              {Array.from({ length: group.seats }).map((_, i) => {
                const kind = i < group.members.length ? "member" : i < group.members.length + pending ? "pending" : "free";
                return (
                  <div
                    key={i}
                    className={cn(
                      "h-2.5 rounded-full",
                      kind === "member" && "bg-premium",
                      kind === "pending" && "bg-premium/35",
                      kind === "free" && "bg-surface-2",
                    )}
                  />
                );
              })}
            </div>

            {isBuyer && group.active && (
              <div className="mt-5 space-y-4 border-t border-border pt-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Invite a friend</h3>
                  <InviteSearch disabled={free === 0} />
                </div>
                {pending > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Waiting for an answer</h3>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {group.pending.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <Avatar name={p.name} url={p.avatar_url} />
                          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                          <span className="text-xs text-muted">until {p.expires_at.slice(0, 10)}</span>
                          <CancelInvite id={p.id} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {free > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Or share your invite link</h3>
                    <InviteLink url={`${base}/join/${group.invite_code}`} ownerName={buyer?.name.split(/\s+/)[0] ?? "Your friend"} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Friends */}
          <section aria-label="Friends" className="rounded-2xl border border-border bg-surface shadow-soft">
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Trophy className="h-4 w-4 text-premium" />
              <h2 className="font-semibold">Friends this week</h2>
              <span className="text-sm text-muted">· points since Monday</span>
            </header>
            <ol>
              {ranked.map((m, i) => {
                const tier = tierForRating(m.overall ?? m.rating);
                const me = m.id === profile.id;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-0">
                    <span className="w-5 text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
                    <Avatar name={m.name} url={m.avatar_url} size={11} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/u/${m.id}`} className="block truncate font-semibold hover:underline">
                        {m.name}
                        {me && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                        {m.is_owner && <span className="ml-1.5 text-xs font-normal text-premium">buyer</span>}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1" title="Overall: the average of rated skills">
                          <RankBadge tier={tier} size="sm" className="!h-5 !w-5" />
                          {m.overall != null ? `${tier.label} · ${m.overall}` : "Not rated yet"}
                        </span>
                        {m.skills
                          .filter((sk) => sk.counts)
                          .map((sk) => (
                            <span key={sk.skill} className="tabular-nums">
                              {SKILL_LABEL[sk.skill]} {sk.rating}
                            </span>
                          ))}
                        <span className="inline-flex items-center gap-1">
                          <Flame className="h-3.5 w-3.5 text-primary" /> {m.streak}-day streak
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-premium" /> {m.xp} XP
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">{m.points_week}</p>
                      <p className="text-xs text-muted">
                        pts · {m.tests_week} {m.tests_week === 1 ? "test" : "tests"}
                      </p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <MemberActions
                        memberId={m.id}
                        name={m.name.split(/\s+/)[0]}
                        isMe={me && !m.is_owner}
                        canNudge={!me && group.active && !m.practised_today}
                        canRemove={isBuyer && !m.is_owner && !m.active_since_join}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          {/* Weekly goal */}
          <section aria-label="Weekly goal" className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="flex items-center gap-2 font-semibold">
              <Target className="h-4 w-4 text-primary" /> Weekly goal
            </h2>
            {group.members.length < 2 ? (
              <p className="mt-2 text-sm text-muted">Starts when your first friend joins: 5 tests each, together.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  <b className="tabular-nums">{Math.min(group.goal.done, group.goal.target)}</b> / {group.goal.target} tests together
                  this week
                </p>
                <div
                  className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  aria-valuenow={goalPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Weekly goal progress"
                >
                  <div className="h-full rounded-full bg-premium-gradient" style={{ width: `${goalPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {group.goal.reached
                    ? "Goal reached! Everyone got +100 XP. A new goal starts on Monday."
                    : "Reach it and everyone gets +100 XP. Each test counts once per person."}
                </p>
              </>
            )}
          </section>

          {/* Feed */}
          <section aria-label="Group activity" className="rounded-2xl border border-border bg-surface shadow-soft">
            <h2 className="border-b border-border px-5 py-3 font-semibold">Activity</h2>
            {feed.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">No tests yet. Be the first!</p>
            ) : (
              <ul className="max-h-[28rem] overflow-y-auto">
                {feed.map((f, i) => (
                  <li key={i} className="border-b border-border px-5 py-2.5 text-sm last:border-0">
                    <FeedLine item={f} meId={profile.id} />
                    <p className="text-xs text-muted">{ago(f.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Privacy" className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">My settings</h2>
            <PrivacySwitches muteNudges={privacy.muteNudges} hideBands={privacy.hideBands} />
          </section>
        </div>
      </div>
    </div>
  );
}

function FeedLine({ item, meId }: { item: FeedItem; meId: string }) {
  if (item.kind === "goal") {
    return (
      <p>
        🎯 <b>The group reached its weekly goal</b> ({item.target} tests). +100 XP each!
      </p>
    );
  }
  const who = item.whoId === meId ? "You" : item.who.split(/\s+/)[0];
  if (item.kind === "joined") return <p>👋 <b>{who}</b> joined the group</p>;
  const skill = item.skill === "listening" ? "🎧" : item.skill === "reading" ? "📖" : "✍️";
  return (
    <p>
      {skill} <b>{who}</b> finished <span className="font-medium">{item.title}</span>
      {item.band != null && (
        <>
          {" "}
          · band <b>{item.band.toFixed(1)}</b>
        </>
      )}
    </p>
  );
}
