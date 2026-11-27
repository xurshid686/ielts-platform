import { Users } from "lucide-react";
import type { MyInvite } from "@/lib/friends";
import { InviteResponse } from "@/components/friends/friends-client";

/** Dashboard banner for a pending Friends invitation (0078). Shows the newest one. */
export function InviteBanner({ invites }: { invites: MyInvite[] }) {
  const i = invites[0];
  if (!i) return null;
  return (
    <section
      aria-label="Group invitation"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-premium/50 bg-premium/10 px-5 py-4"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-premium-gradient text-white">
        <Users className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {i.inviter} invited you to {i.group_name}
        </p>
        <p className="text-sm text-muted">
          Join their Friends group and get Premium.
          {invites.length > 1 && ` You have ${invites.length} invitations.`}
        </p>
      </div>
      <InviteResponse id={i.id} compact />
    </section>
  );
}
