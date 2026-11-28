import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPremiumActive, passWeekStart, trialDaysLeft } from "@/lib/premium";
import { passState, trialEndsAt } from "@/lib/passes";
import type { ResultLite } from "@/lib/analytics";
import { pickToday } from "@/lib/today-pick";
import { testPath } from "@/lib/tests/ref";
import { SITE_URL } from "@/lib/site";
import { dailyText } from "@/lib/telegram/student-router";

// The student bot's server side (0070): link codes, the chat <-> account
// binding, and "which test should this student get today".
//
// Service role; it authorises itself. A user id comes from the verified session
// (the link route) or from a verified single-use link code (the bot). Untyped
// client until `npm run types` sees 0070 — the lib/ultima.ts stopgap.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

const LINK_CODE_TTL_MS = 15 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function newCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** The Telegram chat a student linked to the bot, or null. */
export async function chatForUser(userId: string): Promise<number | null> {
  const { data } = await db().from("student_bot_links").select("chat_id").eq("user_id", userId).maybeSingle();
  return data?.chat_id != null ? Number(data.chat_id) : null;
}

export async function isLinked(userId: string): Promise<boolean> {
  const { data } = await db().from("student_bot_links").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function mintStudentLinkCode(userId: string): Promise<string | null> {
  const client = db();
  await client.from("student_link_codes").delete().eq("user_id", userId).is("used_at", null);
  const code = newCode();
  const { error } = await client.from("student_link_codes").insert({
    code,
    user_id: userId,
    expires_at: new Date(Date.now() + LINK_CODE_TTL_MS).toISOString(),
  });
  return error ? null : code;
}

/** Spend a code and bind the chat. Conditional UPDATE: two taps cannot both win. */
export async function consumeStudentLinkCode(code: string, chatId: number): Promise<string | null> {
  const client = db();
  const { data } = await client
    .from("student_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (!data) return null;
  const userId = data.user_id as string;
  await client.from("student_bot_links").delete().eq("chat_id", chatId);
  const { error } = await client
    .from("student_bot_links")
    .upsert({ user_id: userId, chat_id: chatId, daily_on: true, linked_at: new Date().toISOString() });
  return error ? null : userId;
}

/**
 * Bind a chat to an account WITHOUT a code. Only for the Mini App, where the caller has proven
 * both sides at once: the account by its session, the Telegram user by signed initData
 * (lib/telegram-miniapp.ts). Same one-chat-one-account replacement as a code.
 */
export async function linkStudentChat(userId: string, chatId: number): Promise<boolean> {
  const client = db();
  await client.from("student_bot_links").delete().eq("chat_id", chatId);
  const { error } = await client
    .from("student_bot_links")
    .upsert({ user_id: userId, chat_id: chatId, daily_on: true, linked_at: new Date().toISOString() });
  return !error;
}

export async function studentForChat(chatId: number): Promise<string | null> {
  const { data } = await db().from("student_bot_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export async function setDaily(chatId: number, on: boolean): Promise<void> {
  await db().from("student_bot_links").update({ daily_on: on }).eq("chat_id", chatId);
}

export type DailyLink = { user_id: string; chat_id: number; last_daily: string | null };

export async function dailyRecipients(): Promise<DailyLink[]> {
  const { data } = await db().from("student_bot_links").select("user_id, chat_id, last_daily").eq("daily_on", true);
  return ((data ?? []) as DailyLink[]).map((r) => ({ ...r, chat_id: Number(r.chat_id) }));
}

export async function markDailySent(userId: string, day: string): Promise<void> {
  await db().from("student_bot_links").update({ last_daily: day }).eq("user_id", userId);
}

/** A student blocked the bot (403): stop the daily push rather than retrying forever. */
export async function disableDailyForUser(userId: string): Promise<void> {
  await db().from("student_bot_links").update({ daily_on: false }).eq("user_id", userId);
}

export type CatalogueRow = {
  id: string;
  slug: string | null;
  title: string;
  skill: "reading" | "listening";
  kind: "single" | "full";
  tier: string;
  track: string | null;
  question_types: string[] | null;
  difficulty: number | null;
  created_at: string;
};

/** The regular reading catalogue, read once per cron run. */
export async function loadReadingCatalogue(): Promise<CatalogueRow[]> {
  const { data } = await db()
    .from("tests")
    .select("id, slug, title, skill, kind, tier, track, question_types, difficulty, created_at")
    .eq("skill", "reading")
    .order("created_at", { ascending: false });
  return ((data ?? []) as CatalogueRow[]).filter((t) => (t.track ?? "regular") === "regular");
}

/** Tashkent-local YYYY-MM-DD. */
export function tashkentDay(now: number = Date.now()): string {
  return new Date(now + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Today's message for one student: the reading test that best trains their
 * weakest question type among tests they can open (a weekly pass counts as
 * "can open" while they have one left), else the newest unattempted one.
 * Null when there is nothing left to suggest.
 */
export async function buildDaily(
  userId: string,
  catalogue: CatalogueRow[],
  now: number = Date.now(),
): Promise<{ text: string; url: string; path: string } | null> {
  const client = db();
  const [{ data: prof }, { data: mine }, trialEnd] = await Promise.all([
    client.from("profiles").select("name, role, premium_until, rating").eq("id", userId).maybeSingle(),
    client.from("results").select("test_id, skill, raw, total").eq("user_id", userId).eq("skill", "reading"),
    trialEndsAt(userId),
  ]);
  if (!prof) return null;
  const p = prof as { name: string | null; role: string; premium_until: string | null; rating: number | null };
  const member = p.role === "admin" || isPremiumActive(p);
  const trialLeft = trialDaysLeft(trialEnd, now);
  const passes = member || trialLeft > 0 ? null : await passState(userId);
  const opensAll = member || trialLeft > 0;

  // The pick itself is lib/today-pick.ts: the SAME rule the dashboard's Today card uses.
  const today = pickToday({
    catalogue,
    results: (mine ?? []) as ResultLite[],
    rating: p.rating ?? 1000,
    opensAll,
    passes,
  });
  if (!today) return null;
  const { test: pick, kind } = today;

  const monday = passWeekStart(now) === tashkentDay(now);
  const firstName = (p.name ?? "").trim().split(/\s+/)[0] || null;
  return {
    text: dailyText({
      name: firstName,
      title: pick.title,
      kind,
      passesLeft: passes ? passes.left : null,
      monday,
      trialDaysLeft: trialLeft,
    }),
    url: `${SITE_URL}${testPath("reading", pick)}`,
    // Site-relative, for the Mini App button (/tg?next=<path>).
    path: testPath("reading", pick),
  };
}
