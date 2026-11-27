import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveStreak } from "@/lib/day";
import { likeLiteral } from "@/lib/utils";

export { cleanCode, cleanGroupName, weekStartIso } from "@/lib/friends-shared";
import { cleanCode, weekStartIso } from "@/lib/friends-shared";

// The Friends plan's server side (0077 + 0078): one buyer's Premium shared by up
// to FRIENDS_SEATS people who join by link or by personal invitation.
//
// Service role, and it authorises ITSELF: user ids come from the verified
// session, never from a request body. The tables are newer than
// src/types/supabase.ts, so this talks to them untyped until `npm run types`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

export type JoinStatus = "joined" | "already" | "full" | "expired" | "not_found" | "other_group";
const JOIN_STATUSES: JoinStatus[] = ["joined", "already", "full", "expired", "not_found", "other_group"];

export type GroupMember = {
  id: string;
  name: string;
  avatar_url: string | null;
  joined_at: string;
  is_owner: boolean;
  rating: number;
  rated_count: number;
  streak: number;
  xp: number;
  /** Rated points since Monday 00:00 UTC (the weekly leaderboard's week). */
  points_week: number;
  /** Tests submitted since Monday 00:00 UTC. */
  tests_week: number;
  /** Any test since joining: the buyer can only remove members with none. */
  active_since_join: boolean;
  /** No test today (Tashkent): a nudge makes sense. */
  practised_today: boolean;
};

export type PendingInvite = { id: string; invitee_id: string; name: string; avatar_url: string | null; expires_at: string };

export type FriendsGroup = {
  id: string;
  owner_id: string;
  name: string;
  custom_name: boolean;
  seats: number;
  expires_at: string;
  invite_code: string;
  created_at: string;
  hidden: boolean;
  members: GroupMember[];
  pending: PendingInvite[];
  active: boolean;
  goal: { done: number; target: number; members: number; reached: boolean };
};

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";
const tashkentDay = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);

/** The group a user belongs to (as buyer or member), with everything the group page shows. */
export async function groupOf(userId: string): Promise<FriendsGroup | null> {
  const { data: mine } = await db()
    .from("premium_group_members")
    .select("group_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mine) return null;
  return loadGroup(String(mine.group_id));
}

export async function loadGroup(groupId: string): Promise<FriendsGroup | null> {
  const client = db();
  const { data: g } = await client
    .from("premium_groups")
    .select("id, owner_id, seats, expires_at, invite_code, created_at, name, hidden_from_leaderboard")
    .eq("id", groupId)
    .maybeSingle();
  if (!g) return null;

  const [{ data: rows }, { data: inv }, { data: goal }] = await Promise.all([
    client.from("premium_group_members").select("user_id, joined_at").eq("group_id", groupId).order("joined_at"),
    client
      .from("premium_group_invites")
      .select("id, invitee_id, expires_at")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at"),
    client.rpc("friends_goal_progress", { p_group: groupId }),
  ]);
  const ids = (rows ?? []).map((r) => String(r.user_id));
  const invIds = (inv ?? []).map((r) => String(r.invitee_id));
  const earliestJoin = (rows ?? []).reduce(
    (min, r) => (String(r.joined_at) < min ? String(r.joined_at) : min),
    new Date().toISOString(),
  );
  const since = [weekStartIso(new Date()), earliestJoin].sort()[0];

  const [{ data: profs }, { data: results }] = await Promise.all([
    client
      .from("profiles")
      .select("id, name, avatar_url, rating, rated_count, streak, last_activity_date, timezone, xp")
      .in("id", [...ids, ...invIds]),
    ids.length
      ? client.from("results").select("user_id, rated, points, submitted_at").in("user_id", ids).gte("submitted_at", since)
      : Promise.resolve({ data: [] as { user_id: string; rated: boolean; points: number; submitted_at: string }[] }),
  ]);
  const byId = new Map((profs ?? []).map((p) => [String(p.id), p]));
  const week = weekStartIso(new Date());
  const today = tashkentDay(new Date());
  const joinedAt = new Map((rows ?? []).map((r) => [String(r.user_id), String(r.joined_at)]));

  const stats = new Map<string, { pts: number; tests: number; sinceJoin: boolean; today: boolean }>();
  for (const r of results ?? []) {
    const id = String(r.user_id);
    const s = stats.get(id) ?? { pts: 0, tests: 0, sinceJoin: false, today: false };
    const at = String(r.submitted_at);
    if (at >= week) {
      s.tests += 1;
      if (r.rated) s.pts += Number(r.points ?? 0);
    }
    if (at >= (joinedAt.get(id) ?? at)) s.sinceJoin = true;
    if (tashkentDay(new Date(at)) === today) s.today = true;
    stats.set(id, s);
  }

  const nameOf = (p: Record<string, unknown> | undefined) => (p?.name as string)?.trim() || "Student";
  const members: GroupMember[] = (rows ?? []).map((r) => {
    const id = String(r.user_id);
    const p = byId.get(id);
    const s = stats.get(id);
    return {
      id,
      name: nameOf(p),
      avatar_url: (p?.avatar_url as string) ?? null,
      joined_at: String(r.joined_at),
      is_owner: id === String(g.owner_id),
      rating: Number(p?.rating ?? 1000),
      rated_count: Number(p?.rated_count ?? 0),
      streak: liveStreak(Number(p?.streak ?? 0), p?.last_activity_date as string, p?.timezone as string),
      xp: Number(p?.xp ?? 0),
      points_week: s?.pts ?? 0,
      tests_week: s?.tests ?? 0,
      active_since_join: s?.sinceJoin ?? false,
      practised_today: s?.today ?? false,
    };
  });
  const owner = members.find((m) => m.is_owner);
  const gp = (goal ?? {}) as { done?: number; target?: number; members?: number; reached?: boolean };

  return {
    id: String(g.id),
    owner_id: String(g.owner_id),
    name: (g.name as string) || `${firstName(owner?.name) || "Friends"}'s group`,
    custom_name: !!g.name,
    seats: Number(g.seats),
    expires_at: String(g.expires_at),
    invite_code: String(g.invite_code),
    created_at: String(g.created_at),
    hidden: !!g.hidden_from_leaderboard,
    members,
    pending: (inv ?? []).map((i) => {
      const p = byId.get(String(i.invitee_id));
      return {
        id: String(i.id),
        invitee_id: String(i.invitee_id),
        name: nameOf(p),
        avatar_url: (p?.avatar_url as string) ?? null,
        expires_at: String(i.expires_at),
      };
    }),
    active: new Date(String(g.expires_at)).getTime() > Date.now(),
    goal: {
      done: Number(gp.done ?? 0),
      target: Number(gp.target ?? 0),
      members: Number(gp.members ?? members.length),
      reached: !!gp.reached,
    },
  };
}

// ------------------------------------------------------------------ joining

/** Join by invite code. The seat check and the Premium grant happen in one locked SQL call. */
export async function joinGroup(userId: string, code: string): Promise<JoinStatus> {
  const c = cleanCode(code);
  if (!c) return "not_found";
  const { data, error } = await db().rpc("friends_join", { p_user: userId, p_code: c });
  if (error) throw new Error(`friends_join: ${error.message}`);
  const s = String(data) as JoinStatus;
  return JOIN_STATUSES.includes(s) ? s : "not_found";
}

/** What a /join/<code> visitor may see: the buyer's first name and the seats left. */
export async function invitePreview(code: string): Promise<
  | { ok: true; groupId: string; ownerName: string; groupName: string; seatsLeft: number; seats: number; active: boolean }
  | { ok: false }
> {
  const c = cleanCode(code);
  if (!c) return { ok: false };
  const client = db();
  const { data: g } = await client
    .from("premium_groups")
    .select("id, owner_id, seats, expires_at, name")
    .eq("invite_code", c)
    .maybeSingle();
  if (!g) return { ok: false };
  const [{ data: owner }, { data: used }] = await Promise.all([
    client.from("profiles").select("name").eq("id", g.owner_id).maybeSingle(),
    client.rpc("friends_seats_used", { p_group: g.id }),
  ]);
  // First name only: the link may be forwarded to people the buyer doesn't know.
  const ownerName = firstName(owner?.name as string) || "A friend";
  return {
    ok: true,
    groupId: String(g.id),
    ownerName,
    groupName: (g.name as string) || `${ownerName}'s group`,
    seats: Number(g.seats),
    seatsLeft: Math.max(0, Number(g.seats) - Number(used ?? 0)),
    active: new Date(String(g.expires_at)).getTime() > Date.now(),
  };
}

// ------------------------------------------------------------------ invitations

export type MyInvite = { id: string; group_id: string; group_name: string; inviter: string; expires_at: string };

/** Pending invitations to this user, newest first. */
export async function myInvites(userId: string): Promise<MyInvite[]> {
  const client = db();
  const { data } = await client
    .from("premium_group_invites")
    .select("id, group_id, invited_by, expires_at")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (!data?.length) return [];
  const groupIds = [...new Set(data.map((d) => String(d.group_id)))];
  const inviterIds = [...new Set(data.map((d) => String(d.invited_by)))];
  const [{ data: groups }, { data: inviters }] = await Promise.all([
    client.from("premium_groups").select("id, name, owner_id").in("id", groupIds),
    client.from("profiles").select("id, name").in("id", inviterIds),
  ]);
  const gName = new Map((groups ?? []).map((g) => [String(g.id), g.name as string | null]));
  const who = new Map((inviters ?? []).map((p) => [String(p.id), firstName(p.name as string) || "A friend"]));
  return data.map((d) => {
    const inviter = who.get(String(d.invited_by)) ?? "A friend";
    return {
      id: String(d.id),
      group_id: String(d.group_id),
      group_name: gName.get(String(d.group_id)) || `${inviter}'s group`,
      inviter,
      expires_at: String(d.expires_at),
    };
  });
}

export type InviteCandidate = { id: string; name: string; avatar_url: string | null; level: string };

/**
 * Students the buyer can invite: an exact email, or a name search. Returns no
 * emails, so the box can't be used to read other students' addresses.
 */
export async function searchInvitable(q: string, buyerId: string): Promise<InviteCandidate[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  let req = db()
    .from("profiles")
    .select("id, name, avatar_url, level")
    .neq("id", buyerId)
    .neq("role", "admin")
    .limit(6);
  req = term.includes("@") ? req.ilike("email", likeLiteral(term)) : req.ilike("name", `%${likeLiteral(term)}%`);
  const { data } = await req;
  return (data ?? []).map((p) => ({
    id: String(p.id),
    name: (p.name as string)?.trim() || "Student",
    avatar_url: (p.avatar_url as string) ?? null,
    level: String(p.level ?? "regular"),
  }));
}

export type InviteStatus =
  | "invited" | "full" | "member" | "other_group" | "already_invited" | "self" | "expired_group" | "no_group" | "no_user";

export async function inviteStudent(buyerId: string, inviteeId: string): Promise<InviteStatus> {
  const { data, error } = await db().rpc("friends_invite", { p_owner: buyerId, p_invitee: inviteeId });
  if (error) throw new Error(`friends_invite: ${error.message}`);
  return String(data) as InviteStatus;
}

/**
 * Tell an invited student: bell, email and (if linked) the Telegram bot.
 * Never throws; the invitation stands whatever happens to the messages.
 */
export async function notifyInvite(buyerId: string, inviteeId: string): Promise<{ email: boolean; telegram: boolean }> {
  const out = { email: false, telegram: false };
  try {
    const client = db();
    const group = await groupOf(buyerId);
    const invite = group?.pending.find((p) => p.invitee_id === inviteeId);
    if (!group || !invite) return out;
    const inviter = firstName(group.members.find((m) => m.is_owner)?.name) || "A friend";
    const expiresOn = invite.expires_at.slice(0, 10);
    await client.from("notifications").insert({
      user_id: inviteeId,
      type: "friends_invite",
      title: `${inviter} invited you to ${group.name}`,
      body: "Join their Friends group and get Premium. Accept or decline on the invitations page.",
      data: { href: "/premium/group/invites" },
    });
    const { data: who } = await client.from("profiles").select("name, email").eq("id", inviteeId).maybeSingle();
    if (who?.email) {
      const { sendFriendsInviteEmail } = await import("@/lib/email/send");
      const r = await sendFriendsInviteEmail({
        to: String(who.email),
        name: who.name as string,
        inviter,
        groupName: group.name,
        expiresOn,
      });
      out.email = r.sent;
      if (!r.sent) console.warn("[friends] invite email not sent:", r.error);
    }
    const { chatForUser } = await import("@/lib/student-bot");
    const chat = await chatForUser(inviteeId);
    if (chat) {
      const { sendStudentText, escapeHtml } = await import("@/lib/telegram/student-api");
      const { EMAIL_BASE_URL } = await import("@/lib/email/send");
      const r = await sendStudentText(
        chat,
        `👋 <b>${escapeHtml(inviter)}</b> invited you to <b>${escapeHtml(group.name)}</b> on MockOnline.\nJoin to get Premium and practise together.`,
        { label: "See the invitation", href: `${EMAIL_BASE_URL}/premium/group/invites` },
      );
      out.telegram = r.ok;
    }
  } catch (e) {
    console.error("[friends] notifyInvite failed", e);
  }
  return out;
}

export async function respondInvite(userId: string, inviteId: string, accept: boolean): Promise<string> {
  const { data, error } = await db().rpc("friends_respond", { p_user: userId, p_invite: inviteId, p_accept: accept });
  if (error) throw new Error(`friends_respond: ${error.message}`);
  return String(data);
}

export async function cancelInvite(buyerId: string, inviteId: string): Promise<string> {
  const { data, error } = await db().rpc("friends_cancel_invite", { p_owner: buyerId, p_invite: inviteId });
  if (error) throw new Error(`friends_cancel_invite: ${error.message}`);
  return String(data);
}

// ------------------------------------------------------------------ members

export async function leaveGroup(userId: string): Promise<string> {
  const { data, error } = await db().rpc("friends_leave", { p_user: userId });
  if (error) throw new Error(`friends_leave: ${error.message}`);
  return String(data);
}

export async function removeInactive(buyerId: string, memberId: string): Promise<string> {
  const { data, error } = await db().rpc("friends_remove_inactive", { p_owner: buyerId, p_member: memberId });
  if (error) throw new Error(`friends_remove_inactive: ${error.message}`);
  return String(data);
}

export async function renameGroup(actorId: string, groupId: string, name: string | null): Promise<string> {
  const { data, error } = await db().rpc("friends_rename", { p_actor: actorId, p_group: groupId, p_name: name });
  if (error) throw new Error(`friends_rename: ${error.message}`);
  return String(data);
}

export async function nudge(fromId: string, toId: string): Promise<string> {
  const { data, error } = await db().rpc("friends_nudge", { p_from: fromId, p_to: toId });
  if (error) throw new Error(`friends_nudge: ${error.message}`);
  return String(data);
}

/** Called after every submitted result. Never throws: a submit must not fail on this. */
export async function checkGroupGoal(userId: string): Promise<void> {
  try {
    await db().rpc("friends_goal_check", { p_user: userId });
  } catch (e) {
    console.error("[friends] goal check failed", e);
  }
}

export async function privacyOf(userId: string): Promise<{ muteNudges: boolean; hideBands: boolean }> {
  const { data } = await db()
    .from("profiles")
    .select("friends_mute_nudges, friends_hide_bands")
    .eq("id", userId)
    .maybeSingle();
  return { muteNudges: !!data?.friends_mute_nudges, hideBands: !!data?.friends_hide_bands };
}

export async function setPrivacy(userId: string, p: { muteNudges: boolean; hideBands: boolean }): Promise<void> {
  const { error } = await db()
    .from("profiles")
    .update({ friends_mute_nudges: p.muteNudges, friends_hide_bands: p.hideBands })
    .eq("id", userId);
  if (error) throw new Error(`friends privacy: ${error.message}`);
}

// ------------------------------------------------------------------ feed + leaderboard

export type FeedItem =
  | { kind: "test"; at: string; who: string; whoId: string; title: string; skill: string; band: number | null; raw: number | null; total: number | null }
  | { kind: "joined"; at: string; who: string; whoId: string }
  | { kind: "goal"; at: string; target: number };

/** The group's recent activity: tests (band hidden if that member chose so), joins, goals. */
export async function groupFeed(group: FriendsGroup, limit = 25): Promise<FeedItem[]> {
  const client = db();
  const ids = group.members.map((m) => m.id);
  if (!ids.length) return [];
  const [{ data: res }, { data: priv }, { data: goals }] = await Promise.all([
    client
      .from("results")
      .select("user_id, test_id, skill, band, raw, total, submitted_at")
      .in("user_id", ids)
      .gte("submitted_at", group.members.reduce((m, x) => (x.joined_at < m ? x.joined_at : m), group.created_at))
      .order("submitted_at", { ascending: false })
      .limit(limit),
    client.from("profiles").select("id, friends_hide_bands").in("id", ids),
    client.from("premium_group_goal_weeks").select("target, reached_at").eq("group_id", group.id).order("reached_at", { ascending: false }).limit(5),
  ]);
  const hide = new Set((priv ?? []).filter((p) => p.friends_hide_bands).map((p) => String(p.id)));
  const testIds = [...new Set((res ?? []).map((r) => r.test_id).filter(Boolean).map(String))];
  const { data: tests } = testIds.length
    ? await client.from("tests").select("id, title").in("id", testIds)
    : { data: [] as { id: string; title: string }[] };
  const title = new Map((tests ?? []).map((t) => [String(t.id), String(t.title)]));
  const nameOf = new Map(group.members.map((m) => [m.id, m.name]));

  const items: FeedItem[] = [
    ...(res ?? []).map((r) => {
      const id = String(r.user_id);
      const hidden = hide.has(id);
      return {
        kind: "test" as const,
        at: String(r.submitted_at),
        who: nameOf.get(id) ?? "Student",
        whoId: id,
        title: title.get(String(r.test_id)) ?? "a test",
        skill: String(r.skill),
        band: hidden || r.band == null ? null : Number(r.band),
        raw: hidden ? null : (r.raw as number | null),
        total: hidden ? null : (r.total as number | null),
      };
    }),
    ...group.members
      .filter((m) => !m.is_owner)
      .map((m) => ({ kind: "joined" as const, at: m.joined_at, who: m.name, whoId: m.id })),
    ...(goals ?? []).map((g) => ({ kind: "goal" as const, at: String(g.reached_at), target: Number(g.target) })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export type GroupRankRow = { group_id: string; name: string; members: number; score: number; rank: number };

export async function groupLeaderboard(kind: "weekly" | "rating"): Promise<GroupRankRow[]> {
  const { data, error } = await db().rpc("friends_group_leaderboard", { p_kind: kind });
  if (error) {
    console.error("[friends] leaderboard", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    group_id: String(r.group_id),
    name: String(r.name),
    members: Number(r.members),
    score: Number(r.score ?? 0),
    rank: Number(r.rank),
  }));
}

// ------------------------------------------------------------------ admin

/** Admin: create or extend the group organised by `ownerId`. */
export async function adminExtendGroup(actorId: string, ownerId: string, months: number) {
  const { data, error } = await db().rpc("admin_friends_extend_as", {
    p_actor: actorId,
    p_owner: ownerId,
    p_months: months,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as { expires_at: string } | null;
  return { ok: true as const, expiresAt: row?.expires_at ?? null };
}

/** Admin: remove a member (never the buyer). Their pre-group Premium date comes back. */
export async function adminRemoveMember(actorId: string, userId: string) {
  const { error } = await db().rpc("admin_friends_remove_as", { p_actor: actorId, p_user: userId });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function adminHideGroup(actorId: string, groupId: string, hidden: boolean) {
  const { error } = await db().rpc("admin_friends_hide_as", { p_actor: actorId, p_group: groupId, p_hidden: hidden });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function adminSetOwner(actorId: string, groupId: string, newOwner: string) {
  const { data, error } = await db().rpc("admin_friends_set_owner_as", {
    p_actor: actorId,
    p_group: groupId,
    p_new_owner: newOwner,
  });
  if (error) return { ok: false as const, error: error.message };
  return data === "changed" ? { ok: true as const } : { ok: false as const, error: "Choose someone already in the group." };
}

/** Tell the buyer someone joined. Never throws. */
export async function notifyJoined(group: FriendsGroup, joinerId: string): Promise<void> {
  try {
    const joiner = group.members.find((m) => m.id === joinerId);
    if (!joiner || joiner.id === group.owner_id) return;
    await db()
      .from("notifications")
      .insert({
        user_id: group.owner_id,
        type: "friends_joined",
        title: `${joiner.name} joined ${group.name}`,
        body: `${group.members.length} of ${group.seats} seats are used.`,
        data: { href: "/premium/group" },
      });
  } catch (e) {
    console.error("[friends] notifyJoined failed", e);
  }
}
