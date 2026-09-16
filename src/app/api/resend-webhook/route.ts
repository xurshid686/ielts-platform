import { createAdminClient } from "@/lib/supabase/admin";
import { shouldAdvance, statusForEvent, verifyWebhook } from "@/lib/email/verify-webhook";

// Resend delivery events (0056): sent / delivered / delayed / bounced /
// complained / failed. This is the only place the platform learns whether an
// email actually ARRIVED — everything else only knows Resend accepted it.
//
// Rules this route follows, because Resend will retry anything that is not 2xx:
//  - a bad signature is 401 (that is not Resend, and retrying will not help);
//  - no configured secret is 503 (our fault, worth retrying after we fix it);
//  - anything else — unknown event type, unknown email id, a row that has moved
//    on — is 200 with no change, so Resend stops asking.
//
// The signature is over the RAW body, so the text is read before any parsing.

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  const body = await req.text();
  const check = verifyWebhook({
    secret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body,
    nowS: Math.floor(Date.now() / 1000),
  });
  if (!check.ok) {
    console.warn(`[resend-webhook] rejected: ${check.reason}`);
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { type?: unknown; data?: { email_id?: unknown; bounce?: { message?: unknown } } } | null = null;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("ok", { status: 200 });
  }

  const status = statusForEvent(event?.type);
  const providerId = typeof event?.data?.email_id === "string" ? event.data.email_id : null;
  if (!status || !providerId) return new Response("ok", { status: 200 });

  const db = createAdminClient();
  const { data } = await db
    .from("mock_messages")
    .select("id, attempt_id, kind, status")
    .eq("provider_id", providerId)
    .maybeSingle();
  const row = data as { id: string; attempt_id: string; kind: string; status: string } | null;
  // Not one of ours (e.g. the admin-promotion email), or already terminal.
  if (!row || !shouldAdvance(row.status, status)) return new Response("ok", { status: 200 });

  const now = new Date().toISOString();
  const reason = typeof event?.data?.bounce?.message === "string" ? event.data.bounce.message.slice(0, 500) : null;
  const { error } = await db
    .from("mock_messages")
    .update({
      status,
      updated_at: now,
      ...(status === "delivered" ? { delivered_at: now } : {}),
      ...(reason ? { error: reason } : {}),
    })
    .eq("id", row.id)
    // Compare-and-set: two events for the same message can land at once.
    .eq("status", row.status);
  if (error) {
    console.error("[resend-webhook] update failed", error.message);
    // Worth a retry from Resend.
    return new Response("Could not record", { status: 500 });
  }

  // The Results list reads this copy instead of joining the log.
  if (row.kind === "result") {
    await db
      .from("mock_attempts")
      .update({
        result_email_status: status,
        ...(reason ? { result_email_error: reason } : {}),
      })
      .eq("id", row.attempt_id);
  }

  return new Response("ok", { status: 200 });
}
