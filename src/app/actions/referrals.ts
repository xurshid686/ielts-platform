"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { REF_COOKIE } from "@/lib/referral";

// Called once right after sign-in/up (from a tiny client component in the app
// layout). Reads the invite code stashed in a cookie, attributes the referral
// in the DB, then clears the cookie so it never fires again. Fully best-effort:
// any failure (e.g. migration 0019 not applied yet) is swallowed silently.
export async function redeemReferralFromCookie(): Promise<{ redeemed: boolean }> {
  const jar = await cookies();
  const code = jar.get(REF_COOKIE)?.value?.trim();
  if (!code) return { redeemed: false };

  // Clear it regardless of outcome — one attempt per invite link.
  jar.delete(REF_COOKIE);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { redeemed: false };

    const { data, error } = await supabase.rpc("redeem_referral", { p_code: code });
    if (error) return { redeemed: false };
    return { redeemed: data === true };
  } catch {
    return { redeemed: false };
  }
}
