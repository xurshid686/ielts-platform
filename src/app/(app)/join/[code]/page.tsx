import Link from "next/link";
import { Users, Crown, Check } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { invitePreview, groupOf } from "@/lib/friends";
import { joinFriendsGroup } from "@/app/actions/friends";
import { SITE_NAME } from "@/lib/site";

export const metadata = { title: "Join a Friends group", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  full: "This group is full. Ask your friend to check their group page.",
  expired: "This group's Premium has ended. Your friend can renew it on the Premium page.",
  other_group: "You are already in another Friends group. A person can be in one group at a time.",
  not_found: "This invite link doesn't work. Check that you copied all of it.",
};

/**
 * The invite link a Friends organiser shares (0077): mockonline.uz/join/<code>.
 * A visitor sees whose group it is and signs up or signs in first (next= brings
 * them back here). Joining is a button (a POST), never the page view itself,
 * so a link preview in Telegram can't use up a seat.
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const profile = await getProfile();
  // With the viewer's id, a seat their own invitation saves counts as free for them (friends_join's rule).
  const [invite, mine] = await Promise.all([
    invitePreview(code, profile?.id ?? null),
    profile ? groupOf(profile.id) : Promise.resolve(null),
  ]);
  const here = `/join/${encodeURIComponent(code)}`;
  const alreadyHere = invite.ok && mine?.id === invite.groupId;
  const inOtherGroup = invite.ok && !!mine && mine.id !== invite.groupId;

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-premium-gradient text-white">
          <Users className="h-7 w-7" />
        </div>

        {!invite.ok ? (
          <>
            <h1 className="mt-4 text-2xl font-bold">Invite link not found</h1>
            <p className="mt-2 text-muted">{ERRORS.not_found}</p>
            <Link href="/premium" className="mt-6 inline-block font-semibold text-primary hover:underline">
              See Premium plans
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-bold">
              {invite.ownerName} invited you to {SITE_NAME} Premium
            </h1>
            <p className="mt-2 text-muted">
              Join <b className="text-foreground">{invite.groupName}</b> and get every Premium IELTS test for as long as
              the group runs.
            </p>
            <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm">
              {["Every premium reading and listening test", "Mock exam place instantly", "Your own account and progress"].map(
                (t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-premium" /> {t}
                  </li>
                ),
              )}
            </ul>
            <p className="mt-4 text-sm font-medium">
              {!invite.active
                ? "This group's Premium has ended"
                : invite.invitedHere
                  ? "A seat is saved for you"
                  : `${invite.seatsLeft} of ${invite.seats} seats left`}
            </p>

            {error && ERRORS[error] && (
              <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                {ERRORS[error]}
              </p>
            )}

            {/* Every state ends in a next step: an ended or full group, or a member of another
                group, used to get a sign-up button or a Join that could only fail. */}
            {alreadyHere ? (
              <Link
                href="/premium/group"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white"
              >
                You&apos;re in this group. Open it
              </Link>
            ) : !invite.active ? (
              <div className="mt-6 space-y-2" data-join-state="ended">
                <p className="text-sm text-muted">Ask {invite.ownerName} to renew it, or get Premium for yourself.</p>
                <Link
                  href="/premium"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white"
                >
                  See Premium plans
                </Link>
              </div>
            ) : inOtherGroup ? (
              <div className="mt-6 space-y-2" data-join-state="other-group">
                <p className="text-sm text-muted">
                  You&apos;re in <b className="text-foreground">{mine!.name}</b>. A person can be in one Friends group at a
                  time, so leave it first to join this one.
                </p>
                <Link
                  href="/premium/group"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold hover:bg-surface-2"
                >
                  Open my group
                </Link>
              </div>
            ) : invite.seatsLeft <= 0 ? (
              <div className="mt-6 space-y-2" data-join-state="full">
                <p className="text-sm text-muted">Every seat is taken. Ask {invite.ownerName}, or get Premium for yourself.</p>
                <Link
                  href="/premium"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white"
                >
                  See Premium plans
                </Link>
              </div>
            ) : !profile ? (
              <div className="mt-6 space-y-2">
                <Link
                  href={`/register?next=${encodeURIComponent(here)}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white"
                >
                  Create a free account to join
                </Link>
                <Link
                  href={`/login?next=${encodeURIComponent(here)}`}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold hover:bg-surface-2"
                >
                  I already have an account
                </Link>
              </div>
            ) : (
              <form action={joinFriendsGroup} className="mt-6">
                <input type="hidden" name="code" value={code} />
                <button
                  type="submit"
                  data-join
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-premium-gradient px-5 py-3 font-semibold text-white hover:opacity-95"
                >
                  <Crown className="h-4 w-4" /> Join and get Premium
                </button>
                <p className="mt-2 text-xs text-muted">Signed in as {profile.email}</p>
              </form>
            )}
          </>
        )}
      </div>
      <p className="mt-4 text-center text-sm">
        <Link href="/premium/friends" className="font-medium text-primary hover:underline">
          How the Friends plan works
        </Link>
      </p>
    </div>
  );
}
