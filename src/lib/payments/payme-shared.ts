// Payme Merchant API (JSON-RPC) — pure helpers, no imports, unit-tested.
// Spec: https://developer.help.paycom.uz/ (Merchant API). Amounts are in TIYIN.

/** A created-but-unpaid transaction expires after 12 hours (Payme's rule). */
export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Payme transaction states. */
export const PaymeState = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1, // before payment
  CANCELLED_AFTER_PERFORM: -2, // refund
} as const;

/** Cancel reason we use when OUR side times a transaction out. */
export const PAYME_REASON_TIMEOUT = 4;

type Msg = { ru: string; uz: string; en: string };
export type PaymeError = { code: number; message: Msg; data?: string };

const m = (en: string, ru: string, uz: string): Msg => ({ en, ru, uz });

export const PaymeErrors = {
  auth: (): PaymeError => ({
    code: -32504,
    message: m("Insufficient privileges", "Недостаточно привилегий", "Huquqlar yetarli emas"),
  }),
  parse: (): PaymeError => ({ code: -32700, message: m("Parse error", "Ошибка разбора", "Tahlil xatosi") }),
  method: (method: string): PaymeError => ({
    code: -32601,
    message: m("Method not found", "Метод не найден", "Metod topilmadi"),
    data: method,
  }),
  amount: (): PaymeError => ({
    code: -31001,
    message: m("Wrong amount", "Неверная сумма", "Noto'g'ri summa"),
  }),
  txNotFound: (): PaymeError => ({
    code: -31003,
    message: m("Transaction not found", "Транзакция не найдена", "Tranzaksiya topilmadi"),
  }),
  cannotPerform: (): PaymeError => ({
    code: -31008,
    message: m("This operation cannot be performed", "Невозможно выполнить операцию", "Amalni bajarib bo'lmaydi"),
  }),
  orderNotFound: (): PaymeError => ({
    code: -31050,
    message: m("Order not found", "Заказ не найден", "Buyurtma topilmadi"),
    data: "order_id",
  }),
  orderBusy: (): PaymeError => ({
    code: -31051,
    message: m(
      "This order is already being paid or is closed",
      "Заказ уже оплачивается или закрыт",
      "Buyurtma allaqachon to'lanmoqda yoki yopilgan",
    ),
    data: "order_id",
  }),
};

export type RpcId = string | number | null;

export const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id: RpcId, error: PaymeError) => ({ jsonrpc: "2.0", id, error });

/** "Basic base64(Paycom:<key>)" -> the "login:password" string, or null. */
export function decodeBasicAuth(header: string | null): string | null {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    return atob(header.slice(6).trim());
  } catch {
    return null;
  }
}

/** Payme checkout link: https://checkout.paycom.uz/<base64("m=..;ac.order_id=..;a=..;c=..")> */
export function paymeCheckoutUrl(opts: {
  base?: string;
  merchantId: string;
  orderId: string;
  amountTiyin: number;
  returnUrl: string;
  lang?: "uz" | "ru" | "en";
}): string {
  const parts = [
    `m=${opts.merchantId}`,
    `ac.order_id=${opts.orderId}`,
    `a=${opts.amountTiyin}`,
    `c=${opts.returnUrl}`,
    `l=${opts.lang ?? "uz"}`,
  ];
  const encoded = btoa(parts.join(";"));
  return `${(opts.base ?? "https://checkout.paycom.uz").replace(/\/$/, "")}/${encoded}`;
}

/** Is a created Payme transaction past its 12-hour window? */
export function paymeTimedOut(createTime: number | null | undefined, now: number): boolean {
  return !!createTime && now - createTime > PAYME_TIMEOUT_MS;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
