import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// The Friends plan's server side (0077): one organiser's Premium shared by up to
// FRIENDS_SEATS people who join with an invite link.
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
  email: string | null;
  avatar_url: string | null;
  joined_at: string;
  is_owner: boolean;
  /** Tests submitted since the start of this week (Monday, UTC). */
  tests_week: number;
};

export type FriendsGroup = {
  id: string;
  owner_id: string;
  seats: number;
  expires_at: string;
  invite_code: string;
  created_at: string;
  members: GroupMember[];
  active: boolean;
};

/** A code as people type it: letters and digits only, upper case. */
export function cleanCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 6 && c.length <= 16 ? c : null;
}

/** Monday 00:00 UTC of the current week, as an ISO string. */
export function weekStartIso(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString();
}

/** The group a user belongs to (as organiser or member), with its members. */
export async function groupOf(userId: string): Promise<FriendsGroup | null> {
  const client = db();
  const { data: mine } = await client
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
    .select("id, owner_id, seats, expires_at, invite_code, created_at")
    .eq("id", groupId)
    .maybeSingle();
  if (!g) return null;

  const { data: rows } = await client
    .from("premium_group_members")
    .select("user_id, joined_at")
    .eq("group_id", groupId)
    .order("joined_at");
  const ids = (rows ?? []).map((r) => String(r.user_id));

  const [{ data: profs }, { data: results }] = await Promise.all([
    client.from("profiles").select("id, name, email, avatar_url").in("id", ids),
    client
      .from("results")
      .select("user_id")
      .in("user_id", ids)
      .gte("submitted_at", weekStartIso(new Date())),
  ]);
  const byId = new Map((profs ?? []).map((p) => [String(p.id), p]));
  const week = new Map<string, number>();
  for (const r of results ?? []) week.set(String(r.user_id), (week.get(String(r.user_id)) ?? 0) + 1);

  const members: GroupMember[] = (rows ?? []).map((r) => {
    const id = String(r.user_id);
    const p = byId.get(id);
    return {
      id,
      name: (p?.name as string) || (p?.email as string)?.split("@")[0] || "Student",
      email: (p?.email as string) ?? null,
      avatar_url: (p?.avatar_url as string) ?? null,
      joined_at: String(r.joined_at),
      is_owner: id === String(g.owner_id),
      tests_week: week.get(id) ?? 0,
    };
  });

  return {
    id: String(g.id),
    owner_id: String(g.owner_id),
    seats: Number(g.seats),
    expires_at: String(g.expires_at),
    invite_code: String(g.invite_code),
    created_at: String(g.created_at),
    members,
    active: new Date(String(g.expires_at)).getTime() > Date.now(),
  };
}

/** Join by invite code. The seat check and the Premium grant happen in one locked SQL call. */
export async function joinGroup(userId: string, code: string): Promise<JoinStatus> {
  const c = cleanCode(code);
  if (!c) return "not_found";
  const { data, error } = await db().rpc("friends_join", { p_user: userId, p_code: c });
  if (error) throw new Error(`friends_join: ${error.message}`);
  const s = String(data) as JoinStatus;
  return JOIN_STATUSES.includes(s) ? s : "not_found";
}

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

/** Admin: remove a member (never the organiser). Premium already given stays. */
export async function adminRemoveMember(actorId: string, userId: string) {
  const { error } = await db().rpc("admin_friends_remove_as", { p_actor: actorId, p_user: userId });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** What a /join/<code> visitor may see: the organiser's first name and the seats left. */
export async function invitePreview(code: string): Promise<
  { ok: true; groupId: string; ownerName: string; seatsLeft: number; seats: number; active: boolean } | { ok: false }
> {
  const c = cleanCode(code);
  if (!c) return { ok: false };
  const client = db();
  const { data: g } = await client
    .from("premium_groups")
    .select("id, owner_id, seats, expires_at")
    .eq("invite_code", c)
    .maybeSingle();
  if (!g) return { ok: false };
  const [{ data: owner }, { count }] = await Promise.all([
    client.from("profiles").select("name").eq("id", g.owner_id).maybeSingle(),
    client.from("premium_group_members").select("user_id", { count: "exact", head: true }).eq("group_id", g.id),
  ]);
  // First name only: the link may be forwarded to people the organiser doesn't know.
  const full = (owner?.name as string) || "A friend";
  return {
    ok: true,
    groupId: String(g.id),
    ownerName: full.trim().split(/\s+/)[0],
    seats: Number(g.seats),
    seatsLeft: Math.max(0, Number(g.seats) - (count ?? 0)),
    active: new Date(String(g.expires_at)).getTime() > Date.now(),
  };
}

/** Tell the organiser someone joined. Never throws. */
export async function notifyJoined(group: FriendsGroup, joinerId: string): Promise<void> {
  try {
    const joiner = group.members.find((m) => m.id === joinerId);
    if (!joiner || joiner.id === group.owner_id) return;
    await db()
      .from("notifications")
      .insert({
        user_id: group.owner_id,
        type: "friends_joined",
        title: `${joiner.name} joined your Friends group`,
        body: `${group.members.length} of ${group.seats} seats are used.`,
        data: { href: "/premium/group" },
      });
  } catch (e) {
    console.error("[friends] notifyJoined failed", e);
  }
}
