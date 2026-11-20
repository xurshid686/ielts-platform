import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileStore } from "@/lib/storage";

// The Ultima plan's server side: who holds it, where a test's PDF lives, and how a Telegram
// chat is bound to an account. Migration 0066.
//
// Service role, and it authorises ITSELF: nothing here trusts an id from a request. The user id
// comes from the verified session (the site) or from a verified single-use link code (the bot).
//
// The tables are not in src/types/supabase.ts until `npm run types` has been run against a
// database that has 0066. Until then this module talks to them through an untyped client; delete
// `db()` and use createAdminClient() directly the moment the types are regenerated, so the real
// signatures are checked again.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

export const PAPERS_BUCKET = "papers";
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export type TestPdf = {
  test_id: string;
  r2_key: string;
  bytes: number;
  pages: number;
  tg_file_id: string | null;
};

/** The bot's public username (without @). Unset = the PDF button is hidden everywhere. */
export function teacherBotUsername(): string | null {
  const u = (process.env.TEACHER_BOT_USERNAME || process.env.NEXT_PUBLIC_TEACHER_BOT_USERNAME || "").trim();
  return u ? u.replace(/^@/, "") : null;
}

/** Is this account on an active Ultima plan? Admins always pass, so the owner can test. */
export async function isUltima(userId: string): Promise<boolean> {
  const client = db();
  const { data: prof } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (prof?.role === "admin") return true;
  const { data } = await client.from("ultima_members").select("ultima_until").eq("user_id", userId).maybeSingle();
  return !!data?.ultima_until && new Date(data.ultima_until).getTime() > Date.now();
}

/** Grant Ultima until a date (owner-side; callers must gate). */
export async function grantUltima(userId: string, until: Date, grantedBy: string | null): Promise<void> {
  const { error } = await db()
    .from("ultima_members")
    .upsert({ user_id: userId, ultima_until: until.toISOString(), granted_by: grantedBy, granted_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getTestPdf(testId: string): Promise<TestPdf | null> {
  const { data, error } = await db()
    .from("test_pdfs")
    .select("test_id, r2_key, bytes, pages, tg_file_id")
    .eq("test_id", testId)
    .maybeSingle();
  // A missing table (0066 not applied yet) reads as "no PDF" so the site keeps working.
  if (error || !data) return null;
  return data as TestPdf;
}

export async function hasTestPdf(testId: string): Promise<boolean> {
  return (await getTestPdf(testId)) !== null;
}

/** The PDF bytes from storage, or null. */
export async function readPdfBytes(pdf: TestPdf): Promise<Uint8Array | null> {
  const path = pdf.r2_key.replace(/^papers\//, "");
  const { data, error } = await fileStore(PAPERS_BUCKET, db()).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function rememberFileId(testId: string, fileId: string): Promise<void> {
  await db().from("test_pdfs").update({ tg_file_id: fileId }).eq("test_id", testId);
}

/** Forget a cached file_id (Telegram said it is no longer valid). */
export async function forgetFileId(testId: string): Promise<void> {
  await db().from("test_pdfs").update({ tg_file_id: null }).eq("test_id", testId);
}

function newCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export async function linkedChatFor(userId: string): Promise<number | null> {
  const { data } = await db().from("teacher_bot_links").select("chat_id").eq("user_id", userId).maybeSingle();
  return data ? Number(data.chat_id) : null;
}

/** Mint a single-use code for a signed-in user. Older unused codes of theirs are dropped. */
export async function mintLinkCode(userId: string): Promise<string | null> {
  const client = db();
  await client.from("teacher_link_codes").delete().eq("user_id", userId).is("used_at", null);
  const code = newCode();
  const { error } = await client.from("teacher_link_codes").insert({
    code,
    user_id: userId,
    expires_at: new Date(Date.now() + LINK_CODE_TTL_MS).toISOString(),
  });
  return error ? null : code;
}

/**
 * Spend a code and bind `chatId` to its account. The UPDATE is conditional on
 * unused + unexpired, so two taps of the same link cannot both win.
 * Returns the user id, or null when the code is invalid, used or expired.
 */
export async function consumeLinkCode(code: string, chatId: number): Promise<string | null> {
  const client = db();
  const { data } = await client
    .from("teacher_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (!data) return null;
  const userId = data.user_id as string;
  // One chat <-> one account. Re-linking a chat to a new account replaces the old binding.
  await client.from("teacher_bot_links").delete().eq("chat_id", chatId);
  const { error } = await client.from("teacher_bot_links").upsert({ user_id: userId, chat_id: chatId });
  return error ? null : userId;
}

export async function userForChat(chatId: number): Promise<string | null> {
  const { data } = await db().from("teacher_bot_links").select("user_id").eq("chat_id", chatId).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}
