"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  adminExtendGroup,
  adminHideGroup,
  adminRemoveMember,
  adminSetOwner,
  cleanGroupName,
  renameGroup,
} from "@/lib/friends";
import { GRANT_PERIODS } from "@/lib/site";

type Result = { ok: true; text: string } | { ok: false; text: string };

const touch = (groupPath?: string) => {
  revalidatePath("/admin/groups");
  if (groupPath?.startsWith("/admin/")) revalidatePath(groupPath);
};


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
  touch(`/admin/members/${ownerId}`);
  return { ok: true, text: `Friends group runs until ${r.expiresAt?.slice(0, 10)}. Members' Premium raised to match.` };
}

/** Remove a member from a group (never the organiser). */
export async function adminRemoveFriend(userId: string, pagePath: string): Promise<Result> {
  const actor = await adminId();
  if (!actor) return { ok: false, text: "Admins only." };
  const r = await adminRemoveMember(actor, userId);
  if (!r.ok) return { ok: false, text: r.error };
  touch(pagePath);
  return { ok: true, text: "Removed from the group. Their group Premium ended; Premium they had before is kept." };
}


/** Rename any group (the buyer can too, from their page). Empty = the default name. */
export async function adminRenameGroup(groupId: string, raw: string, pagePath = "/admin/groups"): Promise<Result> {
  const actor = await adminId();
  if (!actor) return { ok: false, text: "Admins only." };
  const checked = cleanGroupName(String(raw ?? ""));
  if (!checked.ok) return { ok: false, text: checked.error };
  const s = await renameGroup(actor, groupId, checked.name);
  touch(pagePath);
  return s === "renamed" ? { ok: true, text: "Name saved." } : { ok: false, text: "Could not rename." };
}

export async function adminSetGroupHidden(groupId: string, hidden: boolean): Promise<Result> {
  const actor = await adminId();
  if (!actor) return { ok: false, text: "Admins only." };
  const r = await adminHideGroup(actor, groupId, hidden);
  touch();
  return r.ok ? { ok: true, text: hidden ? "Hidden from the group leaderboard." : "Shown on the group leaderboard." } : { ok: false, text: r.error };
}

export async function adminChangeBuyer(groupId: string, newOwner: string): Promise<Result> {
  const actor = await adminId();
  if (!actor) return { ok: false, text: "Admins only." };
  const r = await adminSetOwner(actor, groupId, newOwner);
  touch();
  return r.ok ? { ok: true, text: "Buyer changed." } : { ok: false, text: r.error };
}

