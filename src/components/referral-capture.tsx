"use client";

import { useEffect } from "react";
import { REF_COOKIE } from "@/lib/referral";

// Mounted globally (root layout). If the visitor arrived via an invite link
// (?ref=CODE), stash the code in a cookie so it survives the signup/OAuth
// round-trip and can be redeemed once the account exists. Pure client-side —
// no Suspense boundary needed (reads window.location, not useSearchParams).
export function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref");
    if (!raw) return;
    const code = raw.trim().toUpperCase().slice(0, 16);
    if (!/^[A-Z0-9]{4,16}$/.test(code)) return;
    // 14-day window matches redeem_referral()'s attribution cutoff.
    document.cookie = `${REF_COOKIE}=${code}; path=/; max-age=${14 * 24 * 60 * 60}; samesite=lax`;
  }, []);

  return null;
}
