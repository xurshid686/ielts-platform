import { createClient } from "@/lib/supabase/server";

// Mints a short-lived Gemini ephemeral token so the browser can open the Live
// API WebSocket WITHOUT ever seeing the real GEMINI_API_KEY. Tokens are
// single-use, expire quickly, and are only issued to signed-in users.
//
// Used by: src/lib/live/live-session.ts (client).
export const LIVE_MODEL = "gemini-2.5-flash-native-audio-latest";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return Response.json(
      { error: "Live conversation isn't set up (no GEMINI_API_KEY)." },
      { status: 503 },
    );

  // Daily usage cap (cost control). Admins unlimited; premium higher.
  const { data: allowed } = await supabase.rpc("use_ai_quota", { p_kind: "live" });
  if (allowed === false) {
    return Response.json(
      { error: "You've reached today's live-conversation limit. Try again tomorrow or go Premium." },
      { status: 429 },
    );
  }

  // 30 min to talk; 2 min window to actually open the session.
  const expireTime = new Date(Date.now() + 30 * 60_000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60_000).toISOString();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uses: 1,
        expire_time: expireTime,
        new_session_expire_time: newSessionExpireTime,
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: `Could not start live session: ${detail.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { name?: string };
  if (!data.name)
    return Response.json({ error: "No token returned." }, { status: 502 });

  return Response.json({ token: data.name, model: LIVE_MODEL });
}
