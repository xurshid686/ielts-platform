import "server-only";

import { createClient } from "@/lib/supabase/server";
import { EXPIRING_DAYS, LAPSED_DAYS, membershipStage, type MembershipStage } from "@/lib/premium";
import { allUltima } from "@/lib/ultima";
import { rows } from "@/types/database";
import type { MemberRow } from "@/app/actions/admin";

// The Members table, paged ON THE SERVER. The old page loaded the newest 500
// accounts plus up to 1000 ever-premium ones and filtered in the browser, so a
// student outside those windows could not be found except by search.

export const MEMBER_STAGES = [
  { id: "all", label: "All" },
  { id: "premium", label: "Premium now" },
  { id: "expiring", label: `Ending in ${EXPIRING_DAYS} days` },
  { id: "lapsed", label: `Lapsed, last ${LAPSED_DAYS} days` },
  { id: "expired", label: "Lapsed earlier" },
  { id: "admins", label: "Admins" },
] as const;
export type MemberStage = (typeof MEMBER_STAGES)[number]["id"];

export const MEMBER_SORTS = [
  { id: "joined", label: "Newest", column: "created_at", ascending: false },
  { id: "active", label: "Last active", column: "last_activity_date", ascending: false },
  { id: "xp", label: "XP", column: "xp", ascending: false },
  { id: "rating", label: "Rating", column: "rating", ascending: false },
  { id: "premium", label: "Premium ends", column: "premium_until", ascending: true },
] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number]["id"];

export const MEMBERS_PER_PAGE = 50;

export type MembersQuery = { q: string; stage: MemberStage; sort: MemberSort; page: number };

export function parseMembersQuery(sp: Record<string, string | string[] | undefined>): MembersQuery {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const stage = MEMBER_STAGES.some((s) => s.id === one("stage")) ? (one("stage") as MemberStage) : "all";
  const sort = MEMBER_SORTS.some((s) => s.id === one("sort")) ? (one("sort") as MemberSort) : "joined";
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));
  return { q: one("q").slice(0, 100), stage, sort, page };
}

export type MemberTableRow = MemberRow & {
  created_at: string;
  rating: number;
  streak: number;
  is_owner: boolean;
  /** Premium stage and days, computed here (Date.now() is off-limits in a component). */
  membership: { stage: MembershipStage; days: number } | null;
  ultima_active: boolean;
};

const COLUMNS =
  "id, email, name, avatar_url, role, is_owner, level, premium_until, xp, rating, streak, hidden_from_leaderboard, last_activity_date, created_at";

export async function loadMembersPage(
  query: MembersQuery,
): Promise<{ rows: MemberTableRow[]; total: number; pages: number }> {
  const supabase = await createClient(); // admins read every profile through RLS
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const sort = MEMBER_SORTS.find((s) => s.id === query.sort)!;

  let req = supabase.from("profiles").select(COLUMNS, { count: "exact" });

  // Strip characters with meaning in PostgREST filter syntax (searchUsers' rule).
  const q = query.q.trim().replace(/[,()*\\]/g, "");
  if (q) req = req.or(`email.ilike.%${q}%,name.ilike.%${q}%`);

  switch (query.stage) {
    case "premium":
      req = req.gt("premium_until", iso(now));
      break;
    case "expiring":
      req = req.gt("premium_until", iso(now)).lte("premium_until", iso(now + EXPIRING_DAYS * day));
      break;
    case "lapsed":
      req = req.lte("premium_until", iso(now)).gt("premium_until", iso(now - LAPSED_DAYS * day));
      break;
    case "expired":
      req = req.lte("premium_until", iso(now - LAPSED_DAYS * day));
      break;
    case "admins":
      req = req.eq("role", "admin");
      break;
  }

  const from = (query.page - 1) * MEMBERS_PER_PAGE;
  const { data, count, error } = await req
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order("id")
    .range(from, from + MEMBERS_PER_PAGE - 1);
  if (error) throw new Error(`[admin] members failed: ${error.message}`);

  const ultima = await allUltima();
  const list = rows<MemberTableRow>(data).map((u) => ({
    ...u,
    ultima_until: ultima.get(u.id) ?? null,
    membership: u.premium_until ? membershipStage(u.premium_until, now) : null,
    ultima_active: !!ultima.get(u.id) && new Date(ultima.get(u.id)!).getTime() > now,
  }));
  const total = count ?? list.length;
  return { rows: list, total, pages: Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE)) };
}
