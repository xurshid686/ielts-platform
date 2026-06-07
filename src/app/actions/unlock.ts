"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type UnlockResult =
  | { ok: true; xp: number; cost: number }
  | { ok: false; error: string };

// Spend XP to unlock a premium test. The DB function unlock_test enforces the
// cost, the XP balance, and idempotency atomically.
export async function unlockTest(testId: string): Promise<UnlockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { data, error } = await supabase.rpc("unlock_test", { p_test_id: testId });
  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { xp: number; cost: number }
    | undefined;

  revalidatePath("/reading");
  revalidatePath("/listening");
  revalidatePath("/dashboard");
  return { ok: true, xp: row?.xp ?? 0, cost: row?.cost ?? 0 };
}
