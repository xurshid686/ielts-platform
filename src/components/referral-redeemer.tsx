"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { redeemReferralFromCookie } from "@/app/actions/referrals";

// Mounted in the authenticated app layout. Once per session, attempts to
// attribute a stashed invite code to this account. If it lands, refresh so the
// welcome bonus / referred state shows immediately.
export function ReferralRedeemer() {
  const router = useRouter();
  useEffect(() => {
    // Only meaningful if a ref cookie is present; bail cheaply otherwise.
    if (!document.cookie.includes("ielts_ref=")) return;
    if (sessionStorage.getItem("ielts_ref_done")) return;
    sessionStorage.setItem("ielts_ref_done", "1");
    redeemReferralFromCookie().then((r) => {
      if (r.redeemed) router.refresh();
    });
  }, [router]);

  return null;
}
