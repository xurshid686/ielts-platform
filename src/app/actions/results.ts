"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rawToBand } from "@/lib/ielts/bandTable";

export type SaveResultInput = {
  testId: string | null;
  skill: "reading" | "listening";
  raw: number;
  total: number;
  band?: number;
};

export type SaveResultResult =
  | {
      ok: true;
      deduped: boolean; // true = identical submit already counted moments ago
      firstToday: boolean; // true = this was the first completed activity today
      band: number;
      streak: number;
      longest_streak: number;
      xp: number;
    }
  | { ok: false; error: string };

export async function saveResult(input: SaveResultInput): Promise<SaveResultResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const raw = Math.max(0, Math.round(input.raw));
  const total = Math.max(1, Math.round(input.total));
  const band =
    typeof input.band === "number" && input.band > 0
      ? input.band
      : rawToBand(input.skill, raw, total);

  // Idempotency guard: ignore an identical re-submit of the same test within 30s
  // (protects against any accidental double-fire inflating XP/streak).
  const since = new Date(Date.now() - 30_000).toISOString();
  let recentQuery = supabase
    .from("results")
    .select("id")
    .eq("user_id", user.id)
    .gte("submitted_at", since)
    .limit(1);
  recentQuery = input.testId
    ? recentQuery.eq("test_id", input.testId)
    : recentQuery.is("test_id", null);
  const { data: recent } = await recentQuery;
  if (recent && recent.length > 0) {
    return { ok: true, deduped: true, firstToday: false, band, streak: 0, longest_streak: 0, xp: 0 };
  }

  // Was this the first completed activity today? (drives the once-a-day celebration)
  const today = new Date().toISOString().slice(0, 10);
  const { data: prof } = await supabase
    .from("profiles")
    .select("last_activity_date")
    .eq("id", user.id)
    .single();
  const firstToday = (prof as { last_activity_date?: string | null } | null)?.last_activity_date !== today;

  const { error } = await supabase.from("results").insert({
    user_id: user.id,
    test_id: input.testId,
    skill: input.skill,
    raw,
    total,
    band,
  });
  if (error) return { ok: false, error: error.message };

  const { data: act } = await supabase.rpc("record_activity", { p_xp: 20 });
  const a = act?.[0];

  revalidatePath("/dashboard");
  revalidatePath(`/${input.skill}`);

  return {
    ok: true,
    deduped: false,
    firstToday,
    band,
    streak: a?.streak ?? 0,
    longest_streak: a?.longest_streak ?? 0,
    xp: a?.xp ?? 0,
  };
}
