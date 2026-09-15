import { createClient } from "@/lib/supabase/server";
import { recordIntegrityEvents, UUID } from "@/lib/mock";

// Integrity events from the mock exam runner (0052): fullscreen exits, hidden
// tab time, second tab, pastes, device. A route rather than a server action so
// the runner can flush its last batch with navigator.sendBeacon() while the
// page is closing — an action call does not survive unload.
//
// The student is identified by their session cookie, never by the body.
// recordIntegrityEvents() validates, clamps and caps everything, and stamps
// server receive time; a student can only ever add events to their own open
// attempt. Nothing here changes a score — it is evidence for the teacher.

const MAX_BODY = 32_000;

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });

  let body: { mockId?: unknown; events?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const mockId = typeof body.mockId === "string" ? body.mockId : "";
  if (!UUID.test(mockId) || !Array.isArray(body.events)) return new Response(null, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  try {
    await recordIntegrityEvents(user.id, mockId, body.events);
  } catch (e) {
    console.error("[mock-events]", e);
  }
  return new Response(null, { status: 204 });
}
