import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { paymeConfig } from "@/lib/payments/config";
import {
  PAYME_REASON_TIMEOUT,
  PaymeErrors,
  PaymeState,
  decodeBasicAuth,
  isUuid,
  paymeTimedOut,
  rpcError,
  rpcResult,
  type RpcId,
} from "@/lib/payments/payme-shared";
import {
  afterPaid,
  afterRefund,
  attachTx,
  cancelOrder,
  fulfilOrder,
  getOrder,
  getOrderByTx,
  planName,
  paymeStatement,
  type OrderRow,
} from "@/lib/payments/orders";

/**
 * Payme Merchant API endpoint (0073), JSON-RPC over POST. Payme calls this; a
 * student never does. Always HTTP 200: Payme reads the error from the body.
 *
 * The rules that keep money and Premium in step:
 * - The amount is checked against the ORDER's amount (set on the server at
 *   checkout), never trusted from anywhere else.
 * - One transaction per order (attachTx is conditional on an unclaimed order).
 * - Perform goes through fulfil_payment_order, which pays ONCE however often
 *   Payme retries; Cancel after Perform is a refund and takes the months back.
 */
const json = (body: unknown) => Response.json(body, { status: 200 });

function authOk(header: string | null, key: string): boolean {
  const got = decodeBasicAuth(header);
  if (!got) return false;
  const want = Buffer.from(`Paycom:${key}`);
  const have = Buffer.from(got);
  return want.length === have.length && timingSafeEqual(want, have);
}

function txView(o: OrderRow) {
  return {
    create_time: o.create_time ?? 0,
    perform_time: o.perform_time ?? 0,
    cancel_time: o.cancel_time ?? 0,
    transaction: o.id,
    state: o.payme_state ?? PaymeState.CREATED,
    reason: o.cancel_reason ?? null,
  };
}

export async function POST(req: Request) {
  const cfg = paymeConfig();
  let id: RpcId = null;
  let body: { id?: RpcId; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
    id = body.id ?? null;
  } catch {
    return json(rpcError(null, PaymeErrors.parse()));
  }
  // Not configured on this host: refuse exactly like a wrong key.
  if (!cfg || !authOk(req.headers.get("authorization"), cfg.key)) {
    return json(rpcError(id, PaymeErrors.auth()));
  }

  const p = body.params ?? {};
  const now = Date.now();

  // Shared checks for CheckPerformTransaction and CreateTransaction.
  async function checkOrder(): Promise<{ order: OrderRow } | { error: ReturnType<typeof PaymeErrors.amount> }> {
    const orderId = (p.account as { order_id?: unknown } | undefined)?.order_id;
    if (!isUuid(orderId)) return { error: PaymeErrors.orderNotFound() };
    const order = await getOrder(orderId);
    // user_id is NULL once the buyer deleted their account: nobody would receive
    // what is paid for, so refuse the payment instead of taking the money.
    if (!order || order.provider !== "payme" || !order.user_id) return { error: PaymeErrors.orderNotFound() };
    if (Number(p.amount) !== order.amount_tiyin) return { error: PaymeErrors.amount() };
    return { order };
  }

  switch (body.method) {
    case "CheckPerformTransaction": {
      const r = await checkOrder();
      if ("error" in r) return json(rpcError(id, r.error));
      if (r.order.status !== "created") return json(rpcError(id, PaymeErrors.orderBusy()));
      const result: Record<string, unknown> = { allow: true };
      if (cfg.ikpu && cfg.packageCode) {
        result.detail = {
          receipt_type: 0,
          items: [
            {
              title: `MockOnline ${planName(r.order.plan)}, ${r.order.months === 1 ? "1 month" : `${r.order.months} months`}`,
              price: r.order.amount_tiyin,
              count: 1,
              code: cfg.ikpu,
              package_code: cfg.packageCode,
              vat_percent: 0,
            },
          ],
        };
      }
      return json(rpcResult(id, result));
    }

    case "CreateTransaction": {
      const txId = String(p.id ?? "");
      if (!txId) return json(rpcError(id, PaymeErrors.txNotFound()));
      const existing = await getOrderByTx("payme", txId);
      if (existing) {
        // A retry must describe the same order and amount as the original call.
        const retryOrder = (p.account as { order_id?: unknown } | undefined)?.order_id;
        if (retryOrder !== existing.id) return json(rpcError(id, PaymeErrors.orderNotFound()));
        if (Number(p.amount) !== existing.amount_tiyin) return json(rpcError(id, PaymeErrors.amount()));
        if (existing.payme_state !== PaymeState.CREATED) return json(rpcError(id, PaymeErrors.cannotPerform()));
        if (paymeTimedOut(existing.create_time, now)) {
          await cancelOrder(existing.id, PAYME_REASON_TIMEOUT, now);
          return json(rpcError(id, PaymeErrors.cannotPerform()));
        }
        return json(rpcResult(id, { create_time: existing.create_time, transaction: existing.id, state: PaymeState.CREATED }));
      }
      const r = await checkOrder();
      if ("error" in r) return json(rpcError(id, r.error));
      // Another transaction (or a payment) already holds this order.
      if (r.order.status !== "created") return json(rpcError(id, PaymeErrors.orderBusy()));
      const claimed = await attachTx(r.order.id, txId, { create_time: now, payme_state: PaymeState.CREATED });
      if (!claimed) return json(rpcError(id, PaymeErrors.orderBusy()));
      return json(rpcResult(id, { create_time: claimed.create_time, transaction: claimed.id, state: PaymeState.CREATED }));
    }

    case "PerformTransaction": {
      const order = await getOrderByTx("payme", String(p.id ?? ""));
      if (!order) return json(rpcError(id, PaymeErrors.txNotFound()));
      if (order.payme_state === PaymeState.PERFORMED) {
        return json(rpcResult(id, { transaction: order.id, perform_time: order.perform_time, state: PaymeState.PERFORMED }));
      }
      if (order.payme_state !== PaymeState.CREATED) return json(rpcError(id, PaymeErrors.cannotPerform()));
      if (paymeTimedOut(order.create_time, now)) {
        await cancelOrder(order.id, PAYME_REASON_TIMEOUT, now);
        return json(rpcError(id, PaymeErrors.cannotPerform()));
      }
      const paid = await fulfilOrder(order.id, now);
      if (!paid) return json(rpcError(id, PaymeErrors.cannotPerform()));
      after(() => afterPaid(paid));
      return json(rpcResult(id, { transaction: paid.id, perform_time: paid.perform_time, state: PaymeState.PERFORMED }));
    }

    case "CancelTransaction": {
      const order = await getOrderByTx("payme", String(p.id ?? ""));
      if (!order) return json(rpcError(id, PaymeErrors.txNotFound()));
      if (order.payme_state === PaymeState.CANCELLED || order.payme_state === PaymeState.CANCELLED_AFTER_PERFORM) {
        return json(rpcResult(id, { transaction: order.id, cancel_time: order.cancel_time, state: order.payme_state }));
      }
      const wasPaid = order.status === "paid";
      const cancelled = await cancelOrder(order.id, Number(p.reason ?? 0), now);
      if (!cancelled) return json(rpcError(id, PaymeErrors.cannotPerform()));
      if (wasPaid) after(() => afterRefund(cancelled));
      return json(rpcResult(id, { transaction: cancelled.id, cancel_time: cancelled.cancel_time, state: cancelled.payme_state }));
    }

    case "CheckTransaction": {
      const order = await getOrderByTx("payme", String(p.id ?? ""));
      if (!order) return json(rpcError(id, PaymeErrors.txNotFound()));
      return json(rpcResult(id, txView(order)));
    }

    case "GetStatement": {
      const rows = await paymeStatement(Number(p.from ?? 0), Number(p.to ?? 0));
      return json(
        rpcResult(id, {
          transactions: rows.map((o) => ({
            id: o.provider_tx_id,
            time: o.create_time,
            amount: o.amount_tiyin,
            account: { order_id: o.id },
            ...txView(o),
          })),
        }),
      );
    }

    default:
      return json(rpcError(id, PaymeErrors.method(String(body.method))));
  }
}
