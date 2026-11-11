import { NextResponse } from "next/server";
import { setRemindersByToken } from "@/lib/reminder-preference";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One-click unsubscribe (RFC 8058). Every reminder carries
//   List-Unsubscribe: <…/api/unsubscribe?token=…>
//   List-Unsubscribe-Post: List-Unsubscribe=One-Click
// and Gmail / Outlook turn that into their own "Unsubscribe" button, which
// POSTs here with no cookies. The token is the credential (see
// lib/reminder-preference.ts).
//
// POST changes the preference. GET never does: it sends a person to the page
// with the button, because scanners fetch links.
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  // Always 200 for a well-formed request: a mail provider retries on errors,
  // and "unknown token" is not something to reveal to a prober either.
  await setRemindersByToken(token, false);
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, url.origin), 303);
}
