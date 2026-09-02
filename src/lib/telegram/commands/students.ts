import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fmtStudent, fmtSearchResults, escapeHtml, type StudentCard } from "../format";
import { encodeCb } from "../callback";
import type { InlineKeyboard } from "../types";

// Search and manage one student.
//
// Every write goes through the `*_as` RPCs added in migration 0042. The bot has
// no session, so `auth.uid()` is NULL and the original RPCs would raise
// "Only admins can ..." — see CLAUDE.md, "The Telegram admin bot".

/**
 * The admin id the bot acts as.
 *
 * The `*_as` functions still run `is_admin(p_actor)`, so this is not a
 * formality: the check moved, it was not removed. Resolved per request rather
 * than cached, because it is one indexed lookup and a stale id would fail
 * confusingly after an ownership change.
 */
async function actorId(): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("is_owner", true)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

function backRow() {
  return [{ text: "‹ Menu", callback_data: encodeCb("menu") }];
}

export async function searchStudents(
  query: string,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const db = createAdminClient();

  // Strip the characters that have meaning in PostgREST's filter grammar before
  // interpolating — the same scrub searchUsers() uses in app/actions/admin.ts.
  const q = query.trim().replace(/[,()*\\]/g, "");
  if (!q) {
    return { text: "Send a name or email to search for.", keyboard: [backRow()] };
  }

  const { data, error } = await db
    .from("profiles")
    .select("id, name, email, role, premium_until")
    .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    return { text: `Search failed: ${escapeHtml(error.message)}`, keyboard: [backRow()] };
  }

  const people = (data ?? []) as {
    id: string;
    name: string | null;
    email: string | null;
    premium_until: string | null;
  }[];

  const keyboard: InlineKeyboard = people.map((p) => [
    {
      text: `${p.premium_until && new Date(p.premium_until) > new Date() ? "👑 " : ""}${
        p.name || p.email || p.id.slice(0, 8)
      }`,
      callback_data: encodeCb("stu", p.id),
    },
  ]);
  keyboard.push(backRow());

  return { text: fmtSearchResults(q, people.length), keyboard };
}

export async function buildStudentCard(
  id: string,
): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const db = createAdminClient();

  const { data: prof } = await db
    .from("profiles")
    .select(
      "id, name, email, role, is_owner, level, xp, streak, rating, premium_until, hidden_from_leaderboard, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!prof) return null;

  const p = prof as {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    is_owner: boolean;
    level: string;
    xp: number;
    streak: number;
    rating: number | null;
    premium_until: string | null;
    hidden_from_leaderboard: boolean;
    created_at: string | null;
  };

  // Named columns only: `results.answers` holds the whole 40-question response
  // map, and there is no reason to pull it across the wire for a summary.
  const { data: res } = await db
    .from("results")
    .select("skill, band, submitted_at, tests(title)")
    .eq("user_id", id)
    .order("submitted_at", { ascending: false })
    .limit(200);

  const rows = (res ?? []) as {
    skill: string | null;
    band: number | null;
    submitted_at: string;
    tests: { title: string | null } | { title: string | null }[] | null;
  }[];

  const bands = rows.map((r) => r.band).filter((b): b is number => typeof b === "number");

  const card: StudentCard = {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    isOwner: p.is_owner,
    level: p.level,
    xp: p.xp,
    streak: p.streak,
    rating: p.rating,
    premiumUntil: p.premium_until,
    hidden: p.hidden_from_leaderboard,
    createdAt: p.created_at,
    attempts: rows.length,
    avgBand: bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : null,
    lastAttempt: rows[0]?.submitted_at ?? null,
    recent: rows.slice(0, 3).map((r) => ({
      skill: r.skill,
      band: r.band,
      // PostgREST returns an embedded row as an object or an array depending on
      // how it infers the relationship; accept both rather than guess.
      title: Array.isArray(r.tests) ? (r.tests[0]?.title ?? null) : (r.tests?.title ?? null),
    })),
  };

  return { text: fmtStudent(card), keyboard: studentKeyboard(p.id, p.hidden_from_leaderboard) };
}

function studentKeyboard(id: string, hidden: boolean): InlineKeyboard {
  return [
    [
      { text: "👑 +1 month", callback_data: encodeCb("prem", "1", id) },
      { text: "👑 +3 months", callback_data: encodeCb("prem", "3", id) },
    ],
    [
      { text: "✖ Revoke premium", callback_data: encodeCb("prem", "0", id) },
      { text: "✨ Gift XP", callback_data: encodeCb("xp", id) },
    ],
    [{ text: "🎚 Change level", callback_data: encodeCb("lvl", id) }],
    [
      {
        text: hidden ? "👁 Show on leaderboard" : "🙈 Hide from leaderboard",
        callback_data: encodeCb("hide", hidden ? "0" : "1", id),
      },
    ],
    [{ text: "‹ Menu", callback_data: encodeCb("menu") }],
  ];
}

export function levelKeyboard(id: string): InlineKeyboard {
  return [
    [
      { text: "Regular", callback_data: encodeCb("setlvl", "regular", id) },
      { text: "Pre-IELTS", callback_data: encodeCb("setlvl", "pre_ielts", id) },
      { text: "Intro", callback_data: encodeCb("setlvl", "intro", id) },
    ],
    [{ text: "‹ Back", callback_data: encodeCb("stu", id) }],
  ];
}

export function xpKeyboard(id: string): InlineKeyboard {
  // Fixed amounts, so granting XP never needs a free-text step.
  return [
    [
      { text: "+50", callback_data: encodeCb("setxp", "50", id) },
      { text: "+100", callback_data: encodeCb("setxp", "100", id) },
      { text: "+500", callback_data: encodeCb("setxp", "500", id) },
    ],
    [
      { text: "−100", callback_data: encodeCb("setxp", "-100", id) },
      { text: "‹ Back", callback_data: encodeCb("stu", id) },
    ],
  ];
}

/**
 * The RPCs address a student by EMAIL, not id, so every write resolves the
 * address first and refuses an account that has none rather than guessing.
 */
async function emailFor(id: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("email").eq("id", id).maybeSingle();
  return (data as { email?: string | null } | null)?.email ?? null;
}

export type ActionOutcome = { ok: boolean; note: string };

async function withTarget(
  id: string,
  run: (actor: string, email: string) => Promise<ActionOutcome>,
): Promise<ActionOutcome> {
  const actor = await actorId();
  if (!actor) return { ok: false, note: "No owner account found to act as." };
  const email = await emailFor(id);
  if (!email) return { ok: false, note: "That account has no email address." };
  return run(actor, email);
}

export async function setPremium(id: string, months: number): Promise<ActionOutcome> {
  return withTarget(id, async (p_actor, target_email) => {
    const db = createAdminClient();
    const { data, error } = await db.rpc("set_premium_as", { p_actor, target_email, months });
    if (error) return { ok: false, note: error.message };
    const until = (data as { premium_until: string | null }[] | null)?.[0]?.premium_until ?? null;
    return {
      ok: true,
      note: until
        ? `Premium until ${new Date(until).toLocaleDateString("en-GB")}`
        : "Premium revoked",
    };
  });
}

export async function giftXp(id: string, amount: number): Promise<ActionOutcome> {
  return withTarget(id, async (p_actor, target_email) => {
    const db = createAdminClient();
    const { data, error } = await db.rpc("gift_xp_as", { p_actor, target_email, amount });
    if (error) return { ok: false, note: error.message };
    const xp = (data as { xp: number }[] | null)?.[0]?.xp ?? 0;
    return { ok: true, note: `${amount > 0 ? "+" : ""}${amount} XP — now ${xp}` };
  });
}

export async function setLevel(id: string, level: string): Promise<ActionOutcome> {
  return withTarget(id, async (p_actor, target_email) => {
    const db = createAdminClient();
    const { error } = await db.rpc("set_user_level_as", {
      p_actor,
      target_email,
      new_level: level,
    });
    if (error) return { ok: false, note: error.message };
    return { ok: true, note: `Level set to ${level}` };
  });
}

export async function setHidden(id: string, hidden: boolean): Promise<ActionOutcome> {
  return withTarget(id, async (p_actor, target_email) => {
    const db = createAdminClient();
    const { error } = await db.rpc("set_leaderboard_hidden_as", {
      p_actor,
      target_email,
      hidden,
    });
    if (error) return { ok: false, note: error.message };
    return {
      ok: true,
      note: hidden ? "Hidden from the leaderboard" : "Visible on the leaderboard",
    };
  });
}
