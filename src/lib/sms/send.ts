// SMS via smsxabarnoma.uz. Server-only. The transport, nothing else.
//
// Needs SMS_API_KEY (an `sk_…` key from smsxabarnoma.uz/app/api-keys).
// SMS_API_BASE overrides the endpoint, for the local recorder in tests.
//
// Like the email sender, it never throws: with no key, or with the provider
// down, it returns { sent: false, error } and the caller records it. A released
// result must never depend on an SMS gateway being up.
//
//   POST /sms/send  X-API-Key, Idempotency-Key  {phone:"998…", text}
//     -> { id, parts, cost, status: "QUEUED", duplicate }
//   FAILED messages are refunded by the provider.
import "server-only";

const API_BASE = (process.env.SMS_API_BASE || "https://smsxabarnoma.uz/api/v1").replace(/\/+$/, "");

export type SmsResult = { sent: boolean; id?: string; error?: string };

export function smsConfigured(): boolean {
  return !!process.env.SMS_API_KEY;
}

export async function sendSms(opts: {
  phone: string;
  text: string;
  idempotencyKey?: string;
}): Promise<SmsResult> {
  const key = process.env.SMS_API_KEY;
  if (!key) return { sent: false, error: "SMS isn't configured (no SMS_API_KEY)." };
  try {
    const res = await fetch(`${API_BASE}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({ phone: opts.phone, text: opts.text }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { id?: string | number; status?: string; message?: string; error?: string }
      | null;
    if (!res.ok) {
      const why = body?.message || body?.error || `HTTP ${res.status}`;
      return { sent: false, error: `SMS provider refused: ${why}`.slice(0, 500) };
    }
    if (body?.status === "FAILED") return { sent: false, id: String(body.id ?? ""), error: "SMS provider: FAILED" };
    return { sent: true, id: body?.id != null ? String(body.id) : undefined };
  } catch (e) {
    return { sent: false, error: (e instanceof Error ? e.message : "SMS request failed").slice(0, 500) };
  }
}
