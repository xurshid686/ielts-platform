import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { publicOrigin } from "@/lib/public-origin";

// OAuth + email-confirmation redirect target.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // NOT new URL(request.url).origin — behind DigitalOcean's proxy that is
  // https://localhost:8080 and sign-in lands on a dead address.
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Use a fixed error code (not reflected text) to avoid content-injection / phishing.
  //
  // A password-recovery link that fails to exchange is the common case here —
  // expired, already used, or opened in a browser that never held the PKCE
  // verifier. Sending those to "Could not sign you in" on /login is a dead end;
  // send them back to the form that can issue a fresh link instead.
  const isRecovery = next.startsWith("/reset-password");
  return NextResponse.redirect(
    `${origin}${isRecovery ? "/forgot-password?error=expired" : "/login?error=auth"}`,
  );
}
