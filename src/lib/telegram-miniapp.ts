import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkStudentChat, studentForChat } from "@/lib/student-bot";
import { userForChat } from "@/lib/ultima";

// The Mini App's account side (/tg -> /api/telegram-miniapp/session).
//
// WHO may be signed in automatically, and how. The route has already verified the
// initData signature (lib/telegram/init-data.ts) before anything here runs.
//
// The Telegram USER id is matched against the linked CHAT id. CLAUDE.md warns
// those are different things; here they are the same number by construction:
// every row in student_bot_links / teacher_bot_links was written from a private
// chat with the bot (a /start deep link, or linkStudentChat below), and a private
// chat's id IS its user's id. A group chat id is negative and never matches.

export type MiniAppAccount =
  | { kind: "student"; userId: string; email: string; name: string | null }
  | { kind: "admin" }
  | { kind: "not_linked" };

export async function accountForTelegram(tgUserId: number): Promise<MiniAppAccount> {
  const userId = (await studentForChat(tgUserId)) ?? (await userForChat(tgUserId));
  if (!userId) return { kind: "not_linked" };
  const admin = createAdminClient();
  const [{ data: prof }, { data: auth }] = await Promise.all([
    admin.from("profiles").select("name, role, is_owner").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  // A link to an account that no longer exists is no account.
  if (!prof || !auth?.user?.email) return { kind: "not_linked" };
  // Never sign an admin in from a phone's Telegram: a lost or stolen Telegram account must not
  // hand anyone the admin panel. Admins use the normal sign-in.
  if (prof.role === "admin" || prof.is_owner) return { kind: "admin" };
  return { kind: "student", userId, email: auth.user.email, name: prof.name ?? null };
}

/**
 * A one-time token for that account, minted server-side. `generateLink` sends NO email; the
 * hashed token is spent at once by the caller's cookie-bound client (verifyOtp), which is what
 * sets the ordinary Supabase session cookies.
 */
export async function mintSignInToken(email: string): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    console.error("[telegram-miniapp] generateLink failed", error.message);
    return null;
  }
  return data?.properties?.hashed_token ?? null;
}

export { linkStudentChat };
