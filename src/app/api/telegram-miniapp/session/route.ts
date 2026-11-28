import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/public-origin";
import { createRateLimiter } from "@/lib/rate-limit";
import { verifyInitData } from "@/lib/telegram/init-data";
import { accountForTelegram, linkStudentChat, mintSignInToken } from "@/lib/telegram-miniapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The Mini App sign-in. /tg posts Telegram's signed `initData`; if that Telegram user has
 * linked a MockOnline account (the daily-test or the PDF link), the browser is signed in as it.
 *
 *   { initData }              -> sign in (or say why not)
 *   { initData, link: true }  -> bind this Telegram to the account the browser is ALREADY
 *                                signed in as (proof of both sides at once), then sign-in is moot
 *
 * Rules (also in CLAUDE.md, "The Mini App"):
 *  - the initData signature (bot token HMAC) is the only identity we accept, and it must be
 *    under 5 minutes old;
 *  - admins and the owner are NEVER signed in this way;
 *  - same-origin POST only, rate-limited per IP and per Telegram user;
 *  - every refusal is a fixed reason code, never reflected text.
 */

const perIp = createRateLimiter({ limit: 20, windowMs: 60_000 });
const perTg = createRateLimiter({ limit: 10, windowMs: 60_000 });
// An initData may MINT a session (or link) once. Its 5-minute lifetime is short, but a string
// copied out of a webview could otherwise be replayed elsewhere inside that window. Keyed by its
// auth_date + Telegram user (unique per Mini App launch); kept past the 5-minute validity so an
// expired-but-remembered entry can't be reused either. In-memory is enough on ONE instance, the
// same reasoning as the webhook's dedupe. A reload after a SUCCESSFUL sign-in still works:
// "already signed in as this student" is answered before this check.
const SPENT_TTL_MS = 10 * 60 * 1000;
const spentAt = new Map<string, number>();
function alreadySpent(tgId: number, authDate: number, now = Date.now()): boolean {
  const key = `${tgId}:${authDate}`;
  const at = spentAt.get(key);
  if (at !== undefined && now - at < SPENT_TTL_MS) return true;
  spentAt.set(key, now);
  if (spentAt.size > 20_000) for (const [k, t] of spentAt) if (now - t >= SPENT_TTL_MS) spentAt.delete(k);
  return false;
}

type Reason = "invalid" | "stale" | "not_linked" | "admin" | "rate" | "config" | "failed" | "origin";

function refuse(reason: Reason, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, reason, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  // A cross-site page cannot get a valid initData anyway, but a sign-in endpoint answers its own
  // origin only.
  const origin = req.headers.get("origin");
  if (!origin || origin !== publicOrigin(req)) return refuse("origin", 403);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!perIp.check(ip).allowed) return refuse("rate", 429);

  const token = process.env.TELEGRAM_TEACHER_BOT_TOKEN;
  if (!token) return refuse("config", 503);

  let body: { initData?: unknown; link?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return refuse("invalid", 400);
  }
  if (typeof body.initData !== "string") return refuse("invalid", 400);

  const v = verifyInitData(body.initData, token);
  if (!v.ok) return refuse(v.reason === "stale" ? "stale" : "invalid", 401);
  const tgId = v.user.tgUserId;
  if (!perTg.check(String(tgId)).allowed) return refuse("rate", 429);

  const supabase = await createClient();
  const {
    data: { user: current },
  } = await supabase.auth.getUser();

  if (body.link === true) {
    // Both proofs in one request: the session says which account, the signature says which Telegram.
    if (!current) return refuse("not_linked", 401, { signedIn: false });
    if (alreadySpent(tgId, v.authDate)) return refuse("stale", 401);
    if (!(await linkStudentChat(current.id, tgId))) return refuse("failed", 500);
    console.info("[telegram-miniapp] linked", { user: current.id });
    return NextResponse.json({ ok: true, linked: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const account = await accountForTelegram(tgId);
  if (account.kind === "admin") return refuse("admin", 403);
  if (account.kind === "not_linked") {
    let name: string | null = null;
    if (current) {
      const { data } = await supabase.from("profiles").select("name").eq("id", current.id).maybeSingle();
      name = data?.name ?? current.email ?? null;
    }
    // A signed-in browser can link right here; the page offers "Connect this Telegram to <name>".
    return refuse("not_linked", 404, { signedIn: !!current, name });
  }

  // Already this student: nothing to do.
  if (current?.id === account.userId) {
    return NextResponse.json({ ok: true, already: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (alreadySpent(tgId, v.authDate)) return refuse("stale", 401);
  // Signed in as someone else in this webview: the Telegram owner wins, the other session goes.
  if (current) await supabase.auth.signOut({ scope: "local" });

  const tokenHash = await mintSignInToken(account.email);
  if (!tokenHash) return refuse("failed", 500);
  const { data, error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || data.user?.id !== account.userId) {
    console.error("[telegram-miniapp] verifyOtp failed", error?.message);
    if (data?.user && data.user.id !== account.userId) await supabase.auth.signOut({ scope: "local" });
    return refuse("failed", 500);
  }
  console.info("[telegram-miniapp] signed in", { user: account.userId });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return new NextResponse(null, { status: 404 });
}
