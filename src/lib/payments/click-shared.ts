// Click SHOP API — helpers, unit-tested. Server-only by use (node:crypto).
// Spec: https://docs.click.uz/click-api-request/ (Prepare action=0, Complete action=1).
import { createHash, timingSafeEqual } from "node:crypto";

export const ClickError = {
  OK: 0,
  SIGN: -1,
  AMOUNT: -2,
  ACTION: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TX_NOT_FOUND: -6,
  UPDATE_FAILED: -7,
  BAD_REQUEST: -8,
  CANCELLED: -9,
} as const;

export const CLICK_NOTES: Record<number, string> = {
  0: "Success",
  [-1]: "SIGN CHECK FAILED!",
  [-2]: "Incorrect parameter amount",
  [-3]: "Action not found",
  [-4]: "Already paid",
  [-5]: "Order does not exist",
  [-6]: "Transaction does not exist",
  [-7]: "Failed to update order",
  [-8]: "Error in request from click",
  [-9]: "Transaction cancelled",
};

export type ClickParams = {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id?: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string;
  error: string;
  error_note?: string;
  sign_time: string;
  sign_string: string;
};

const REQUIRED = ["click_trans_id", "service_id", "merchant_trans_id", "amount", "action", "error", "sign_time", "sign_string"] as const;

/** Read Click's form body into params, or null if a required field is missing. */
export function parseClickForm(form: URLSearchParams, complete: boolean): ClickParams | null {
  const get = (k: string) => form.get(k) ?? undefined;
  for (const k of REQUIRED) if (get(k) == null) return null;
  if (complete && get("merchant_prepare_id") == null) return null;
  return Object.fromEntries([...form.entries()]) as unknown as ClickParams;
}

/** md5(click_trans_id + service_id + SECRET + merchant_trans_id + [merchant_prepare_id] + amount + action + sign_time) */
export function clickSign(p: Omit<ClickParams, "sign_string" | "error">, secret: string): string {
  const prepareId = p.action === "1" ? (p.merchant_prepare_id ?? "") : "";
  const raw = `${p.click_trans_id}${p.service_id}${secret}${p.merchant_trans_id}${prepareId}${p.amount}${p.action}${p.sign_time}`;
  return createHash("md5").update(raw).digest("hex");
}

export function clickSignOk(p: ClickParams, secret: string): boolean {
  const want = Buffer.from(clickSign(p, secret));
  const got = Buffer.from(String(p.sign_string).toLowerCase());
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Click sends so'm with up to 2 decimals ("25000" or "25000.00"); compare in tiyin. */
export function clickAmountTiyin(amount: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return null;
  return Math.round(Number(amount) * 100);
}

export function clickPayUrl(opts: {
  serviceId: string;
  merchantId: string;
  merchantUserId?: string;
  amountUzs: number;
  orderId: string;
  returnUrl: string;
}): string {
  const q = new URLSearchParams({
    service_id: opts.serviceId,
    merchant_id: opts.merchantId,
    amount: String(opts.amountUzs),
    transaction_param: opts.orderId,
    return_url: opts.returnUrl,
  });
  if (opts.merchantUserId) q.set("merchant_user_id", opts.merchantUserId);
  return `https://my.click.uz/services/pay?${q.toString()}`;
}

export function clickReply(
  p: Pick<ClickParams, "click_trans_id" | "merchant_trans_id">,
  error: number,
  extra: Record<string, string | number> = {},
) {
  return {
    click_trans_id: p.click_trans_id,
    merchant_trans_id: p.merchant_trans_id,
    ...extra,
    error,
    error_note: CLICK_NOTES[error] ?? "Error",
  };
}
