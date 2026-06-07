"use server";

import { createClient } from "@/lib/supabase/server";
import { askTutor, type ChatMsg } from "@/lib/ai/tutor";
import { GeminiKeyMissing } from "@/lib/ai/gemini";
import { extractAnswerKey } from "@/lib/ielts/extract-key";
import { canAccessTest } from "@/lib/premium";

export type TutorResult = { ok: true; reply: string } | { ok: false; error: string };

function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Answers a student's question about a test. Quota-limited; respects premium
// access (you can only tutor on tests you can open).
export async function askTutorAction(
  testId: string,
  messages: ChatMsg[],
): Promise<TutorResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { data: allowed } = await supabase.rpc("use_ai_quota", { p_kind: "tutor" });
  if (allowed === false) {
    return {
      ok: false,
      error: "You've reached today's AI tutor limit. Try again tomorrow or go Premium.",
    };
  }

  const { data: test } = await supabase
    .from("tests")
    .select("file_url, tier")
    .eq("id", testId)
    .single();
  const row = test as { file_url?: string; tier?: string } | null;
  if (!row?.file_url) return { ok: false, error: "Test not found." };

  // Don't tutor on premium content the user can't access.
  if (row.tier === "premium") {
    const [{ data: prof }, { data: unlock }] = await Promise.all([
      supabase.from("profiles").select("role, premium_until").eq("id", user.id).single(),
      supabase.from("unlocks").select("id").eq("user_id", user.id).eq("test_id", testId).limit(1),
    ]);
    const p = (prof as { role?: string; premium_until?: string | null } | null) ?? {
      role: "student",
      premium_until: null,
    };
    const unlocked = Array.isArray(unlock) && unlock.length > 0;
    if (!canAccessTest({ role: p.role ?? "student", premium_until: p.premium_until ?? null }, { tier: "premium" }, unlocked)) {
      return { ok: false, error: "This is a premium test — unlock it first to use the tutor." };
    }
  }

  let html = "";
  try {
    const res = await fetch(row.file_url, { cache: "no-store" });
    html = await res.text();
  } catch {
    return { ok: false, error: "Couldn't load the test content." };
  }

  const key = extractAnswerKey(html);
  const context =
    toText(html).slice(0, 11000) +
    (key ? `\n\nANSWER KEY (question number : accepted answers): ${JSON.stringify(key.key)}` : "");

  // Keep only the last few turns to bound the request.
  const trimmed = messages.slice(-8);

  try {
    const reply = await askTutor(context, trimmed);
    return { ok: true, reply };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof GeminiKeyMissing
          ? "The AI tutor isn't set up yet (no API key)."
          : "The tutor couldn't respond just now. Please try again.",
    };
  }
}
