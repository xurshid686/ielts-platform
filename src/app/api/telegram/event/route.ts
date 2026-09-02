import { NextResponse } from "next/server";

import { notifyNewStudent } from "@/lib/telegram/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Called by the database, not by Telegram.
//
// `profiles` rows are created by the handle_new_user() trigger on auth.users,
// and registration (including Google sign-in) goes straight through the
// Supabase client — so there is NO application code path to hook for "a student
// signed up". The database has to be the one that tells us.
//
// Deliberately not a cron poll: vercel.json's schedules only fire on the Vercel
// copy, and the live site is DigitalOcean, so a polled notifier would watch the
// wrong deployment (CLAUDE.md, "Where production actually is").
//
// Auth is a bearer secret, the same shape as the cron routes. It is a SEPARATE
// secret from CRON_SECRET so the two capabilities rotate independently.

function authorized(req: Request): boolean {
  const secret = process.env.TELEGRAM_EVENT_SECRET;
  if (!secret) return false; // unconfigured fails closed
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Payload = {
  type?: string;
  record?: { id?: string; name?: string | null; email?: string | null };
};

export async function POST(req: Request) {
  if (!authorized(req)) {
    // 404 rather than 401, for the same reason as the webhook: an
    // authentication challenge confirms the endpoint is worth attacking.
    return new NextResponse(null, { status: 404 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Supabase database webhooks post { type, table, record, old_record }. The
  // trigger in 0043 posts the same shape so either wiring works.
  const record = body.record;
  if (body.type === "new_student" || body.type === "INSERT") {
    if (record?.id) {
      await notifyNewStudent({
        id: record.id,
        name: record.name ?? null,
        email: record.email ?? null,
      });
    }
  }

  // Always 200 once authorised. pg_net does not retry, and a non-200 would only
  // show up in net._http_response where nobody looks.
  return NextResponse.json({ ok: true });
}
