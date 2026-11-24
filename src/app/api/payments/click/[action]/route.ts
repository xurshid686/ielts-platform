import { after } from "next/server";
import { clickConfig } from "@/lib/payments/config";
import { ClickError, clickAmountTiyin, clickReply, clickSignOk, parseClickForm } from "@/lib/payments/click-shared";
import { isUuid } from "@/lib/payments/payme-shared";
import { afterPaid, attachTx, cancelOrder, fulfilOrder, getOrder } from "@/lib/payments/orders";

/**
 * Click SHOP API endpoint (0073): POST /api/payments/click/prepare and
 * /complete, form-encoded. Click calls these; a student never does.
 * Signature first (md5 with the secret key), then the ORDER's own amount,
 * then fulfil_payment_order, which pays ONCE however often Click retries.
 */
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const complete = action === "complete";
  if (action !== "prepare" && !complete) return new Response("Not found", { status: 404 });

  const form = new URLSearchParams(await req.text());
  const p = parseClickForm(form, complete);
  const blank = { click_trans_id: form.get("click_trans_id") ?? "", merchant_trans_id: form.get("merchant_trans_id") ?? "" };
  if (!p) return Response.json(clickReply(blank, ClickError.BAD_REQUEST));

  const cfg = clickConfig();
  if (!cfg || p.service_id !== cfg.serviceId || !clickSignOk(p, cfg.secret)) {
    return Response.json(clickReply(p, ClickError.SIGN));
  }
  if (p.action !== (complete ? "1" : "0")) return Response.json(clickReply(p, ClickError.ACTION));

  const order = isUuid(p.merchant_trans_id) ? await getOrder(p.merchant_trans_id) : null;
  if (!order || order.provider !== "click") return Response.json(clickReply(p, ClickError.ORDER_NOT_FOUND));
  if (clickAmountTiyin(p.amount) !== order.amount_tiyin) return Response.json(clickReply(p, ClickError.AMOUNT));

  if (!complete) {
    // ---- Prepare
    if (order.status === "paid") return Response.json(clickReply(p, ClickError.ALREADY_PAID));
    if (order.status === "cancelled") return Response.json(clickReply(p, ClickError.CANCELLED));
    if (order.status === "pending") {
      // A retry of the same Prepare is fine; another Click transaction is not.
      if (order.provider_tx_id === p.click_trans_id) {
        return Response.json(clickReply(p, ClickError.OK, { merchant_prepare_id: order.click_prepare_id }));
      }
      return Response.json(clickReply(p, ClickError.TX_NOT_FOUND));
    }
    const claimed = await attachTx(order.id, p.click_trans_id);
    if (!claimed) return Response.json(clickReply(p, ClickError.UPDATE_FAILED));
    return Response.json(clickReply(p, ClickError.OK, { merchant_prepare_id: claimed.click_prepare_id }));
  }

  // ---- Complete
  if (String(order.click_prepare_id) !== p.merchant_prepare_id || order.provider_tx_id !== p.click_trans_id) {
    return Response.json(clickReply(p, ClickError.TX_NOT_FOUND));
  }
  if (order.status === "paid") return Response.json(clickReply(p, ClickError.ALREADY_PAID));
  if (order.status === "cancelled") return Response.json(clickReply(p, ClickError.CANCELLED));

  // Click reports a failed payment with error < 0: close the order, grant nothing.
  if (Number(p.error) < 0) {
    await cancelOrder(order.id, Number(p.error), Date.now());
    return Response.json(clickReply(p, ClickError.CANCELLED));
  }

  const paid = await fulfilOrder(order.id);
  if (!paid) return Response.json(clickReply(p, ClickError.UPDATE_FAILED));
  after(() => afterPaid(paid));
  return Response.json(clickReply(p, ClickError.OK, { merchant_confirm_id: paid.click_prepare_id }));
}
