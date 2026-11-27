import Link from "next/link";
import { Mail, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { groupOf, myInvites } from "@/lib/friends";
import { InviteResponse } from "@/components/friends/friends-client";

export const metadata = { title: "Group invitations", robots: { index: false, follow: false } };

/** Friends invitations to the signed-in student (0078): Accept or Decline each. */
export default async function InvitesPage() {
  const profile = await requireProfile();
  const [invites, group] = await Promise.all([myInvites(profile.id), groupOf(profile.id)]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
        <Mail className="h-6 w-6 text-premium" /> Group invitations
      </h1>
      {group && (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">
          You&apos;re already in <Link href="/premium/group" className="font-semibold text-primary hover:underline">{group.name}</Link>.
          A person can be in one Friends group at a time; leave it first to join another.
        </p>
      )}
      {invites.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted shadow-soft">
          No open invitations.
        </div>
      ) : (
        <ul className="space-y-3">
          {invites.map((i) => (
            <li key={i.id} className="rounded-2xl border border-premium/40 bg-surface p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-premium-gradient text-white">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {i.inviter} invited you to <span className="text-premium">{i.group_name}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    Join to get Premium for as long as the group runs, and practise together. Open until{" "}
                    {i.expires_at.slice(0, 10)}.
                  </p>
                  <div className="mt-3">
                    <InviteResponse id={i.id} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
