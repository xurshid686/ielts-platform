import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREMIUM_PLANS, formatUzs } from "@/lib/site";
import type { Provider } from "./config";

/**
 * Online Premium payments (0073). Service role, authorisation-free: every
 * caller gates first (startCheckout on a verified session; the webhooks on the
 * provider's signature). payment_orders has no grants for anon/authenticated.
 * Untyped client until `npm run types` is re-run (the lib/passes.ts stopgap).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

export type OrderRow = {
  id: string;
  user_id: string | null;
  email_snapshot: string | null;
  months: number;
  amount_tiyin: number;
  provider: Provider;
  status: "created" | "pending" | "paid" | "cancelled";
  provider_tx_id: string | null;
  payme_state: number | null;
  create_time: number | null;
  perform_time: number | null;
  cancel_time: number | null;
  cancel_reason: number | null;
  click_prepare_id: number;
  paid_at: string | null;
  premium_until_after: string | null;
  refunded_at: string | null;
  created_at: string;
};

// bigint columns arrive as strings from PostgREST when large; normalise.
function norm(r: Record<string, unknown> | null): OrderRow | null {
  if (!r) return null;
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...(r as unknown as OrderRow),
    amount_tiyin: Number(r.amount_tiyin),
    create_time: n(r.create_time),
    perform_time: n(r.perform_time),
    cancel_time: n(r.cancel_time),
    click_prepare_id: Number(r.click_prepare_id),
  };
}

/** The plan for a number of months, priced on the SERVER. */
export function planFor(months: number) {
  const plan = PREMIUM_PLANS.find((p) => p.months === months);
  return plan ? { ...plan, amountTiyin: plan.priceUzs * 100 } : null;
}

export async function createOrder(input: {
  userId: string;
  email: string | null;
  months: number;
  provider: Provider;
}): Promise<OrderRow | null> {
  const plan = planFor(input.months);
  if (!plan) return null;
  const { data, error } = await db()
    .from("payment_orders")
    .insert({
      user_id: input.userId,
      email_snapshot: input.email,
      months: plan.months,
      amount_tiyin: plan.amountTiyin,
      provider: input.provider,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[payments] createOrder failed", error.message);
    return null;
  }
  return norm(data);
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const { data } = await db().from("payment_orders").select("*").eq("id", id).maybeSingle();
  return norm(data);
}

export async function getOrderByTx(provider: Provider, txId: string): Promise<OrderRow | null> {
  const { data } = await db()
    .from("payment_orders")
    .select("*")
    .eq("provider", provider)
    .eq("provider_tx_id", txId)
    .maybeSingle();
  return norm(data);
}

/**
 * Attach a provider transaction to a CREATED order. Conditional on the order
 * still being `created` with no transaction, so two providers' calls cannot
 * both claim it. Returns the updated row, or null if someone else got there.
 */
export async function attachTx(
  orderId: string,
  txId: string,
  fields: Record<string, unknown> = {},
): Promise<OrderRow | null> {
  const { data } = await db()
    .from("payment_orders")
    .update({ provider_tx_id: txId, status: "pending", ...fields })
    .eq("id", orderId)
    .eq("status", "created")
    .is("provider_tx_id", null)
    .select("*")
    .maybeSingle();
  return norm(data);
}

/** fulfil_payment_order: pays the order and extends Premium ONCE (idempotent). */
export async function fulfilOrder(orderId: string, performTime?: number): Promise<OrderRow | null> {
  const { data, error } = await db().rpc("fulfil_payment_order", {
    p_order: orderId,
    p_perform_time: performTime ?? null,
  });
  if (error) {
    console.error("[payments] fulfil failed", error.message);
    return null;
  }
  return norm(Array.isArray(data) ? data[0] : data);
}

/** refund_payment_order: cancels; if it was paid, takes the months back (idempotent). */
export async function cancelOrder(orderId: string, reason: number, cancelTime: number): Promise<OrderRow | null> {
  const { data, error } = await db().rpc("refund_payment_order", {
    p_order: orderId,
    p_reason: reason,
    p_cancel_time: cancelTime,
  });
  if (error) {
    console.error("[payments] cancel failed", error.message);
    return null;
  }
  return norm(Array.isArray(data) ? data[0] : data);
}

/** Payme GetStatement: transactions created in [from, to] (ms). */
export async function paymeStatement(from: number, to: number): Promise<OrderRow[]> {
  const { data } = await db()
    .from("payment_orders")
    .select("*")
    .eq("provider", "payme")
    .not("provider_tx_id", "is", null)
    .gte("create_time", from)
    .lte("create_time", to)
    .order("create_time");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => norm(r)!);
}

/** The student's own order, for the thank-you page. Ownership is part of the query. */
export async function getOwnOrder(id: string, userId: string): Promise<OrderRow | null> {
  const { data } = await db().from("payment_orders").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return norm(data);
}

/** Paid orders this calendar month (owner's overview). */
export async function paymentsThisMonth(): Promise<{ count: number; totalUzs: number }> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await db()
    .from("payment_orders")
    .select("amount_tiyin")
    .eq("status", "paid")
    .gte("paid_at", start.toISOString());
  const rows = (data ?? []) as { amount_tiyin: number | string }[];
  return { count: rows.length, totalUzs: rows.reduce((s, r) => s + Number(r.amount_tiyin) / 100, 0) };
}

/** In-app notification + owner Telegram after a payment lands. Never throws. */
export async function afterPaid(order: OrderRow): Promise<void> {
  try {
    const { notifyPayment } = await import("@/lib/telegram/notify");
    const client = db();
    let name = order.email_snapshot ?? "A student";
    if (order.user_id) {
      const { data: prof } = await client.from("profiles").select("name, email").eq("id", order.user_id).maybeSingle();
      name = prof?.name || prof?.email || name;
      await client.from("notifications").insert({
        user_id: order.user_id,
        type: "premium_paid",
        title: "Payment received: Premium is on",
        body: `Thank you! ${order.months === 1 ? "1 month" : `${order.months} months`} of Premium was added to your account.`,
        data: { href: "/premium" },
      });
    }
    await notifyPayment({
      name,
      email: order.email_snapshot,
      provider: order.provider,
      amount: formatUzs(order.amount_tiyin / 100),
      months: order.months,
      until: order.premium_until_after,
      refund: false,
    });
  } catch (e) {
    console.error("[payments] afterPaid failed", e);
  }
}

export async function afterRefund(order: OrderRow): Promise<void> {
  try {
    const { notifyPayment } = await import("@/lib/telegram/notify");
    await notifyPayment({
      name: order.email_snapshot ?? "A student",
      email: order.email_snapshot,
      provider: order.provider,
      amount: formatUzs(order.amount_tiyin / 100),
      months: order.months,
      until: null,
      refund: true,
    });
  } catch (e) {
    console.error("[payments] afterRefund failed", e);
  }
}
