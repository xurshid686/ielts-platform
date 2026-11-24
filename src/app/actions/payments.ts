"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { clickConfig, paymeConfig, type Provider } from "@/lib/payments/config";
import { createOrder, getOwnOrder, planFor } from "@/lib/payments/orders";
import { paymeCheckoutUrl } from "@/lib/payments/payme-shared";
import { clickPayUrl } from "@/lib/payments/click-shared";

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

/** The site the student is on, for the provider's return link (dev preview stays on dev). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mockonline.uz";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Start a Premium payment (0073). The browser sends only the period and the
 * provider; the AMOUNT comes from the server's plan table and is stored on the
 * order, which is what the webhook checks the provider against.
 */
export async function startCheckout(months: number, provider: Provider): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };

  const plan = planFor(months);
  if (!plan) return { ok: false, error: "Choose 1 month or 3 months." };
  const payme = provider === "payme" ? paymeConfig() : null;
  const click = provider === "click" ? clickConfig() : null;
  if (!payme && !click) return { ok: false, error: "This payment method isn't available yet." };

  const order = await createOrder({ userId: user.id, email: user.email ?? null, months, provider });
  if (!order) return { ok: false, error: "Could not start the payment. Please try again." };

  const returnUrl = `${await origin()}/premium/thanks?order=${order.id}`;
  const url = payme
    ? paymeCheckoutUrl({
        base: payme.checkoutBase,
        merchantId: payme.merchantId,
        orderId: order.id,
        amountTiyin: order.amount_tiyin,
        returnUrl,
      })
    : clickPayUrl({
        serviceId: click!.serviceId,
        merchantId: click!.merchantId,
        merchantUserId: click!.merchantUserId,
        amountUzs: order.amount_tiyin / 100,
        orderId: order.id,
        returnUrl,
      });
  return { ok: true, url };
}

export type OrderStatus = { status: "created" | "pending" | "paid" | "cancelled"; until: string | null } | null;

/** The thank-you page polls this. Only the student's own order is visible. */
export async function orderStatus(orderId: string): Promise<OrderStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const o = await getOwnOrder(orderId, user.id);
  return o ? { status: o.status, until: o.premium_until_after } : null;
}
