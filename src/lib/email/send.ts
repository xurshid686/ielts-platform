// Transactional email via Resend (https://resend.com). Server-only.
//
// Needs RESEND_API_KEY. EMAIL_FROM should be an address on a domain verified in
// Resend (e.g. "MockOnline <results@mockonline.uz>"). Without a verified domain
// Resend's onboarding sender only delivers to your own Resend account address —
// fine for testing, useless for students.
//
// Every sender degrades gracefully: with no RESEND_API_KEY it returns
// { sent: false } instead of throwing, so the calling action still succeeds. A
// released result must never depend on an email provider being up.
//
// The HTML lives in ./mock-templates.ts, which imports nothing and is unit
// tested; this module is the transport and the branding.
import "server-only";

import { CONTACT_TELEGRAM_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import {
  buildAdminPromotionEmail,
  buildMockReceiptEmail,
  buildMockResultEmail,
  type Brand,
  type ReceiptEmailInput,
  type ResultEmailInput,
} from "./mock-templates";

/** Overridable so an end-to-end run can point the sender at a local recorder. */
const API_BASE = (process.env.RESEND_BASE_URL || "https://api.resend.com").replace(/\/+$/, "");

/**
 * The base every link in an email is built from. SITE_URL is the canonical
 * public address and is inlined at BUILD time, so a dev-preview build would send
 * students to production; EMAIL_LINK_BASE overrides it at RUN time. One constant
 * for the body and the footer, so they can never disagree.
 */
export const EMAIL_BASE_URL = (process.env.EMAIL_LINK_BASE || SITE_URL).replace(/\/+$/, "");

const BRAND: Brand = { name: SITE_NAME, url: EMAIL_BASE_URL, contactUrl: CONTACT_TELEGRAM_URL };

export type SendResult = { sent: boolean; error?: string };

export type Attachment = {
  filename: string;
  /** Raw bytes; base64-encoded on the way out. */
  content: Uint8Array;
};

/** True when email is configured at all, so the panel can say so rather than guess. */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "Email isn't configured (no RESEND_API_KEY)." };
  const from = process.env.EMAIL_FROM || `${SITE_NAME} <onboarding@resend.dev>`;
  const to = opts.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false, error: `Not a valid address: ${to}` };

  try {
    const res = await fetch(`${API_BASE}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content).toString("base64"),
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}

/** Notifies a user that they've been granted admin access. */
export function sendAdminPromotionEmail(to: string, name?: string | null): Promise<SendResult> {
  const { subject, html } = buildAdminPromotionEmail(BRAND, name);
  return sendEmail({ to, subject, html });
}

/** The released mock result, with the results paper attached (0055). */
export function sendMockResultEmail(
  input: ResultEmailInput & { to: string; pdf?: Attachment },
): Promise<SendResult> {
  const { subject, html } = buildMockResultEmail(BRAND, { ...input, attached: !!input.pdf });
  return sendEmail({ to: input.to, subject, html, attachments: input.pdf ? [input.pdf] : [] });
}

/** "We have your mock" — sent when the student finishes, with no scores. */
export function sendMockReceiptEmail(input: ReceiptEmailInput & { to: string }): Promise<SendResult> {
  const { subject, html } = buildMockReceiptEmail(BRAND, input);
  return sendEmail({ to: input.to, subject, html });
}
