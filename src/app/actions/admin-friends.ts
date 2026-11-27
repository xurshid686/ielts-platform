"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminExtendGroup, adminRemoveMember } from "@/lib/friends";
import { GRANT_PERIODS } from "@/lib/site";

type Result = { ok: true; text: string } | { ok: false; text: string };

/** The signed-in admin's id, or null. The SQL wrappers check is_admin() again. */
async function adminId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("is_admin", { uid: user.id });
  return data ? user.id : null;
}

/** Create or extend the Friends group organised by `ownerId` (manual payment). */
export async function adminGrantFriends(ownerId: string, months: number): Promise<Result> {
  const actor = await adminId();
  if (!actor) return { ok: false, text: "Admins only." };
  if (!GRANT_PERIODS.some((g) => g.months === months)) return { ok: false, text: "Choose a period from the list." };
  const r = await adminExtendGroup(actor, ownerId, months);
  if (!r.ok) {
    return {
      ok: false,
      text: /another group/.test(r.error)
        ? "This student is a member of someone else's group, so they can't organise one."
        : r.error,
    };
  }
  revalidatePath(`/admin/members/${ownerId}`);
  return { ok: true, text: `Friends group runs until ${r.expiresAt?.slice(0, 10)}. Members' Premium raised to match.` };
}

/** Remove a member from a group (never the organiser). */
export async function adminRemoveFriend(userId: string, pagePath: string): Promise<Result> {
  const actor = await adminId();
  if (!actor) return { ok: false, text: "Admins only." };
  const r = await adminRemoveMember(actor, userId);
  if (!r.ok) return { ok: false, text: r.error };
  if (pagePath.startsWith("/admin/")) revalidatePath(pagePath);
  return { ok: true, text: "Removed from the group. Their Premium date was left as it is." };
}
