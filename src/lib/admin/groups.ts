import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGroup, type FriendsGroup } from "@/lib/friends";

// Admin view of every Friends group (0077/0078). Service role; the page gates on requireAdmin().
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables newer than the generated types
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

export async function loadAllGroups(): Promise<FriendsGroup[]> {
  const { data } = await db().from("premium_groups").select("id").order("created_at", { ascending: false }).limit(500);
  const groups = await Promise.all((data ?? []).map((g) => loadGroup(String(g.id))));
  return groups.filter((g): g is FriendsGroup => !!g);
}

export type FriendsStats = { groups: number; active: number; members: number; revenueUzs: number; paidOrders: number };

/** For the admin Overview tile: groups, members, and Friends revenue in the window. */
export async function friendsStats(days: number): Promise<FriendsStats> {
  const client = db();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const now = new Date().toISOString();
  const [{ count: groups }, { data: active }, { data: orders }] = await Promise.all([
    client.from("premium_groups").select("id", { count: "exact", head: true }),
    client.from("premium_groups").select("id").gt("expires_at", now),
    client
      .from("payment_orders")
      .select("amount_tiyin")
      .eq("plan", "friends")
      .eq("status", "paid")
      .is("refunded_at", null)
      .gte("paid_at", since),
  ]);
  const activeIds = (active ?? []).map((g) => String(g.id));
  const { count: members } = activeIds.length
    ? await client.from("premium_group_members").select("user_id", { count: "exact", head: true }).in("group_id", activeIds)
    : { count: 0 };
  return {
    groups: groups ?? 0,
    active: activeIds.length,
    members: members ?? 0,
    paidOrders: (orders ?? []).length,
    revenueUzs: (orders ?? []).reduce((s, o) => s + Number(o.amount_tiyin) / 100, 0),
  };
}
