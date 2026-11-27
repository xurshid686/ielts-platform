"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  cancelInvite as cancelInviteRpc,
  cleanCode,
  cleanGroupName,
  groupOf,
  inviteStudent,
  joinGroup,
  leaveGroup as leaveGroupRpc,
  notifyInvite,
  notifyJoined,
  nudge,
  removeInactive as removeInactiveRpc,
  renameGroup as renameGroupRpc,
  respondInvite as respondInviteRpc,
  searchInvitable,
  setPrivacy,
  type InviteCandidate,
} from "@/lib/friends";

// Every action takes the user from the verified session and passes that id to
// a service-role SQL function that checks the rule itself (0078).

type Result = { ok: true; text: string } | { ok: false; text: string };

async function me(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const refresh = () => revalidatePath("/", "layout");

/** Join a Friends group from /join/<code>. */
export async function joinFriendsGroup(formData: FormData): Promise<void> {
  const code = cleanCode(String(formData.get("code") ?? ""));
  if (!code) redirect("/premium");
  const uid = await me();
  if (!uid) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);

  const status = await joinGroup(uid, code);
  if (status === "joined") {
    const mine = await groupOf(uid);
    if (mine) await notifyJoined(mine, uid);
    refresh();
    redirect("/premium/group?joined=1");
  }
  if (status === "already") redirect("/premium/group");
  redirect(`/join/${code}?error=${status}`);
}

export async function findInvitable(q: string): Promise<InviteCandidate[]> {
  const uid = await me();
  if (!uid) return [];
  return searchInvitable(String(q ?? "").slice(0, 80), uid);
}

const INVITE_TEXT: Record<string, string> = {
  full: "Every seat is taken or held by a pending invitation.",
  member: "They're already in your group.",
  other_group: "They're already in another Friends group.",
  already_invited: "You already invited them. The invitation is still open.",
  self: "That's you!",
  expired_group: "Your group has ended. Renew it to invite friends.",
  no_group: "You don't run a Friends group.",
  no_user: "No such student.",
};

export async function inviteFriend(inviteeId: string): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  if (!/^[0-9a-f-]{36}$/i.test(inviteeId)) return { ok: false, text: "No such student." };
  const status = await inviteStudent(uid, inviteeId);
  if (status !== "invited") return { ok: false, text: INVITE_TEXT[status] ?? "Could not invite." };
  const sent = await notifyInvite(uid, inviteeId);
  refresh();
  const via = ["their notifications", sent.email && "email", sent.telegram && "Telegram"].filter(Boolean).join(", ");
  return { ok: true, text: `Invitation sent (${via}). It holds a seat for 7 days.` };
}

export async function respondInvite(inviteId: string, accept: boolean): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  const status = await respondInviteRpc(uid, inviteId, accept);
  if (status === "joined") {
    const mine = await groupOf(uid);
    if (mine) await notifyJoined(mine, uid);
    refresh();
    return { ok: true, text: "You're in! Premium is on." };
  }
  if (status === "declined") {
    refresh();
    return { ok: true, text: "Invitation declined." };
  }
  const why: Record<string, string> = {
    expired: "This invitation has expired.",
    other_group: "You're already in a Friends group. Leave it first to join another.",
    expired_group: "This group's Premium has ended.",
    cancelled: "The invitation was cancelled.",
  };
  refresh();
  return { ok: false, text: why[status] ?? "This invitation is no longer open." };
}

export async function cancelInvite(inviteId: string): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  const s = await cancelInviteRpc(uid, inviteId);
  refresh();
  return s === "cancelled" ? { ok: true, text: "Invitation cancelled. The seat is free." } : { ok: false, text: "Already answered." };
}

export async function leaveFriendsGroup(): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  const s = await leaveGroupRpc(uid);
  refresh();
  if (s === "left") return { ok: true, text: "You left the group." };
  return { ok: false, text: s === "owner" ? "The buyer can't leave their own group." : "You're not in a group." };
}

export async function removeInactiveMember(memberId: string): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  const s = await removeInactiveRpc(uid, memberId);
  refresh();
  if (s === "removed") return { ok: true, text: "Removed. The seat is free again." };
  return {
    ok: false,
    text: s === "active" ? "They have practised since joining, so they stay in the group." : "Can't remove this member.",
  };
}

export async function renameFriendsGroup(groupId: string, raw: string): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  const checked = cleanGroupName(String(raw ?? ""));
  if (!checked.ok) return { ok: false, text: checked.error };
  const s = await renameGroupRpc(uid, groupId, checked.name);
  refresh();
  return s === "renamed" ? { ok: true, text: "Name saved." } : { ok: false, text: "Only the buyer can rename the group." };
}

export async function nudgeFriend(friendId: string): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  const s = await nudge(uid, friendId);
  const text: Record<string, string> = {
    sent: "Nudge sent!",
    already: "You already nudged them today.",
    practised: "They've already practised today.",
    muted: "They've turned nudges off.",
    not_friends: "You can only nudge people in your group.",
  };
  return { ok: s === "sent", text: text[s] ?? "Could not nudge." };
}

export async function saveFriendsPrivacy(muteNudges: boolean, hideBands: boolean): Promise<Result> {
  const uid = await me();
  if (!uid) return { ok: false, text: "Please sign in again." };
  await setPrivacy(uid, { muteNudges: !!muteNudges, hideBands: !!hideBands });
  refresh();
  return { ok: true, text: "Saved." };
}
