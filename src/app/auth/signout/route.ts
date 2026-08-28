import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/public-origin";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // NOT new URL(request.url).origin — behind DigitalOcean's proxy that is
  // https://localhost:8080, which is where sign-out used to land.
  const origin = publicOrigin(request);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
