import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Crown, Trophy, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { groupOf } from "@/lib/friends";
import { FRIENDS_SEATS } from "@/lib/site";
import { InviteLink } from "@/components/premium/invite-link";

export const metadata = { title: "My Friends group", robots: { index: false, follow: false } };

/** The site the person is on, so a dev-preview link stays on the dev preview. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mockonline.uz";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * A Friends group (0077), for the organiser and the members: the invite link
 * (organiser only), who is in, who practised most this week, and when it ends.
 */
export default async function GroupPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const profile = await requireProfile();
  const { joined } = await searchParams;
  const group = await groupOf(profile.id);

  if (!group) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
        <Users className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 text-2xl font-bold">You&apos;re not in a Friends group</h1>
        <p className="mt-2 text-muted">
          Friends gives Premium to you and up to {FRIENDS_SEATS - 1} friends. Or ask a friend for their invite link.
        </p>
        <Link
          href="/premium"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white"
        >
          See the Friends plan <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const isOrganiser = group.owner_id === profile.id;
  const owner = group.members.find((m) => m.is_owner);
  const free = group.seats - group.members.length;
  const ranked = [...group.members].sort((a, b) => b.tests_week - a.tests_week);
  const until = group.expires_at.slice(0, 10);
  const url = `${await origin()}/join/${group.invite_code}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {joined && (
        <div role="status" className="rounded-2xl border border-success/40 bg-success/10 px-5 py-4 text-sm">
          <b>You&apos;re in!</b> Premium is on until {until}. Every premium test is open to you now.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {isOrganiser ? "My Friends group" : `${owner?.name ?? "Your friend"}'s Friends group`}
          </h1>
          <p className="mt-1 text-muted">
            {group.active ? (
              <>
                Premium for everyone until <b className="text-foreground">{until}</b> · {group.members.length} of{" "}
                {group.seats} seats used
              </>
            ) : (
              <>This group&apos;s Premium ended on {until}.</>
            )}
          </p>
        </div>
        {isOrganiser && (
          <Link
            href="/premium?buy=friends&months=3"
            className="inline-flex items-center gap-2 rounded-xl border border-primary/50 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            <Crown className="h-4 w-4" /> {group.active ? "Add more time" : "Renew"}
          </Link>
        )}
      </div>

      {isOrganiser && group.active && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-lg font-semibold">Invite your friends</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            {free > 0
              ? `Send this link to ${free === 1 ? "1 more friend" : `up to ${free} friends`}. They sign in and get Premium until ${until}.`
              : "Every seat is taken."}
          </p>
          {free > 0 && <InviteLink url={url} ownerName={owner?.name?.split(/\s+/)[0] ?? "Your friend"} />}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface shadow-soft">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Trophy className="h-4 w-4 text-premium" />
          <h2 className="font-semibold">This week</h2>
          <span className="text-sm text-muted">· tests taken since Monday</span>
        </header>
        <ol>
          {ranked.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
              <span className="w-5 text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold">
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  m.name.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {m.name}
                {m.id === profile.id && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                {m.is_owner && <span className="ml-1.5 text-xs text-premium">organiser</span>}
              </span>
              <span className="text-sm tabular-nums">
                <b>{m.tests_week}</b> <span className="text-muted">{m.tests_week === 1 ? "test" : "tests"}</span>
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, free) }).map((_, i) => (
            <li key={`free-${i}`} className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm text-muted last:border-0">
              <span className="w-5" />
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border">+</span>
              Free seat
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
