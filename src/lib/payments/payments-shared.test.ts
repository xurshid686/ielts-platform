import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  PAYME_TIMEOUT_MS,
  PaymeErrors,
  decodeBasicAuth,
  isUuid,
  paymeCheckoutUrl,
  paymeTimedOut,
} from "./payme-shared";
import { clickAmountTiyin, clickPayUrl, clickSign, clickSignOk, parseClickForm } from "./click-shared";
import { PREMIUM_PLANS, formatUzs } from "../site";

describe("plans", () => {
  it("are priced in so'm on the server", () => {
    expect(PREMIUM_PLANS.map((p) => [p.months, p.priceUzs])).toEqual([
      [1, 25000],
      [3, 60000],
    ]);
  });
  it("formats so'm", () => {
    expect(formatUzs(25000)).toBe("25 000 so'm");
    expect(formatUzs(500)).toBe("500 so'm");
  });
});

describe("payme", () => {
  it("builds the checkout URL Payme expects", () => {
    const url = paymeCheckoutUrl({
      merchantId: "m1",
      orderId: "11111111-1111-1111-1111-111111111111",
      amountTiyin: 2500000,
      returnUrl: "https://mockonline.uz/premium/thanks?order=x",
    });
    expect(url.startsWith("https://checkout.paycom.uz/")).toBe(true);
    const decoded = atob(url.split("/").pop()!);
    expect(decoded).toBe(
      "m=m1;ac.order_id=11111111-1111-1111-1111-111111111111;a=2500000;c=https://mockonline.uz/premium/thanks?order=x;l=uz",
    );
  });
  it("decodes Basic auth", () => {
    expect(decodeBasicAuth(`Basic ${btoa("Paycom:secret")}`)).toBe("Paycom:secret");
    expect(decodeBasicAuth("Bearer x")).toBe(null);
    expect(decodeBasicAuth(null)).toBe(null);
  });
  it("times out after 12 hours", () => {
    expect(paymeTimedOut(1000, 1000 + PAYME_TIMEOUT_MS)).toBe(false);
    expect(paymeTimedOut(1000, 1001 + PAYME_TIMEOUT_MS)).toBe(true);
  });
  it("uses Payme's error codes", () => {
    expect(PaymeErrors.auth().code).toBe(-32504);
    expect(PaymeErrors.amount().code).toBe(-31001);
    expect(PaymeErrors.txNotFound().code).toBe(-31003);
    expect(PaymeErrors.cannotPerform().code).toBe(-31008);
    expect(PaymeErrors.orderNotFound().code).toBeLessThanOrEqual(-31050);
    expect(PaymeErrors.orderBusy().code).toBeGreaterThanOrEqual(-31099);
    expect(isUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
  });
});

describe("click", () => {
  const base = {
    click_trans_id: "123",
    service_id: "77",
    merchant_trans_id: "order-1",
    amount: "25000",
    action: "0",
    sign_time: "2026-11-24 12:00:00",
  };
  it("signs Prepare exactly as the spec says", () => {
    const want = createHash("md5").update("12377SECRETorder-1250000" + "2026-11-24 12:00:00").digest("hex");
    expect(clickSign(base, "SECRET")).toBe(want);
  });
  it("signs Complete with merchant_prepare_id", () => {
    const p = { ...base, action: "1", merchant_prepare_id: "9" };
    const want = createHash("md5").update("12377SECRETorder-19250001" + "2026-11-24 12:00:00").digest("hex");
    expect(clickSign(p, "SECRET")).toBe(want);
  });
  it("verifies, case-insensitively, and refuses a forged one", () => {
    const sign = clickSign(base, "SECRET");
    expect(clickSignOk({ ...base, error: "0", sign_string: sign.toUpperCase() }, "SECRET")).toBe(true);
    expect(clickSignOk({ ...base, error: "0", sign_string: sign }, "OTHER")).toBe(false);
    expect(clickSignOk({ ...base, error: "0", sign_string: "short" }, "SECRET")).toBe(false);
  });
  it("reads amounts in so'm", () => {
    expect(clickAmountTiyin("25000")).toBe(2500000);
    expect(clickAmountTiyin("25000.00")).toBe(2500000);
    expect(clickAmountTiyin("1e5")).toBe(null);
    expect(clickAmountTiyin("-1")).toBe(null);
  });
  it("parses the form and requires merchant_prepare_id on Complete", () => {
    const f = new URLSearchParams({ ...base, error: "0", sign_string: "x" });
    expect(parseClickForm(f, false)?.merchant_trans_id).toBe("order-1");
    expect(parseClickForm(f, true)).toBe(null);
  });
  it("builds the pay URL", () => {
    const u = new URL(clickPayUrl({ serviceId: "77", merchantId: "5", amountUzs: 60000, orderId: "o", returnUrl: "https://x/y" }));
    expect(u.host).toBe("my.click.uz");
    expect(u.searchParams.get("amount")).toBe("60000");
    expect(u.searchParams.get("transaction_param")).toBe("o");
  });
});
