"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimPass, startTrial, trialEligible } from "@/lib/passes";
import { notifyTrialStarted } from "@/lib/telegram/notify";

// Weekly free passes and the 3-day trial (0069). The user id ALWAYS comes from
// the verified session; nothing here trusts an id sent by the browser except
// the test id, which claim_premium_pass() re-checks (premium, regular track).

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function claimPassAction(testId: string): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Please sign in first." };
  if (typeof testId !== "string" || !/^[0-9a-f-]{36}$/i.test(testId)) {
    return { ok: false, error: "Unknown test." };
  }
  const outcome = await claimPass(userId, testId);
  if (outcome === "ok" || outcome === "already") {
    revalidatePath("/reading");
    revalidatePath("/listening");
    return { ok: true };
  }
  if (outcome === "limit") {
    return { ok: false, error: "You've used this week's free tests. They come back on Monday." };
  }
  if (outcome === "not_premium") return { ok: false, error: "This test can't be opened with a free pass." };
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function startTrialAction(): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Please sign in first." };
  const { data: prof } = await createAdminClient()
    .from("profiles")
    .select("id, role, premium_until")
    .eq("id", userId)
    .maybeSingle();
  if (!prof || !(await trialEligible(prof as { id: string; role: string; premium_until: string | null }))) {
    return { ok: false, error: "The free trial isn't available on this account." };
  }
  const res = await startTrial(userId);
  if (!res.ok) {
    return {
      ok: false,
      error: res.reason === "already" ? "You've already used your free trial." : "Something went wrong. Please try again.",
    };
  }
  after(() => notifyTrialStarted(userId));
  revalidatePath("/", "layout");
  return { ok: true };
}
