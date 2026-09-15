import { createClient } from "@/lib/supabase/server";
import { saveSectionDraft, saveWriting, UUID } from "@/lib/mock";
import { MAX_ESSAY_CHARS } from "@/lib/mock-shared";

// The last-moment save of a mock section (v2.1): the section flow calls it with
// navigator.sendBeacon() on pagehide and when the student chooses Leave, so the
// answers typed since the last 15–20 s autosave survive a reload, a closed tab
// or the Back button. A route, not a server action — an action call does not
// survive unload (same reason as /api/mock-events).
//
// Same rules as the autosave it complements: the student comes from the session
// cookie, the section must be the one they are on with its clock running, and
// saveSectionDraft / saveWriting refuse anything after the deadline + grace.
// It never hands anything in.

const MAX_BODY = 2 * MAX_ESSAY_CHARS + 16_000;

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });

  let body: { mockId?: unknown; section?: unknown; answers?: unknown; audioPos?: unknown; task1?: unknown; task2?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const mockId = typeof body.mockId === "string" ? body.mockId : "";
  const section = body.section;
  if (!UUID.test(mockId) || (section !== "listening" && section !== "reading" && section !== "writing")) {
    return new Response(null, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  try {
    if (section === "writing") {
      if (typeof body.task1 !== "string" || typeof body.task2 !== "string") return new Response(null, { status: 400 });
      await saveWriting(user.id, mockId, body.task1, body.task2, false);
    } else {
      await saveSectionDraft(user.id, mockId, section, body.answers, body.audioPos);
    }
  } catch (e) {
    console.error("[mock-draft]", e);
  }
  return new Response(null, { status: 204 });
}
