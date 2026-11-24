import "server-only";

/**
 * Which providers are switched on. A provider is live only when the kill
 * switch PAYMENTS_ENABLED=1 is set AND its keys exist, so the Pay buttons stay
 * hidden on any host without real merchant keys (owner, 2026-11-24).
 */
export type Provider = "payme" | "click";

export function paymeConfig() {
  const merchantId = process.env.PAYME_MERCHANT_ID?.trim();
  const key = process.env.PAYME_KEY?.trim();
  if (process.env.PAYMENTS_ENABLED !== "1" || !merchantId || !key) return null;
  return {
    merchantId,
    key,
    checkoutBase: process.env.PAYME_CHECKOUT_URL?.trim() || "https://checkout.paycom.uz",
    // Fiscal receipt item (tasnif.soliq.uz). Optional until the owner has them.
    ikpu: process.env.PAYME_IKPU?.trim() || null,
    packageCode: process.env.PAYME_PACKAGE_CODE?.trim() || null,
  };
}

export function clickConfig() {
  const serviceId = process.env.CLICK_SERVICE_ID?.trim();
  const merchantId = process.env.CLICK_MERCHANT_ID?.trim();
  const secret = process.env.CLICK_SECRET_KEY?.trim();
  if (process.env.PAYMENTS_ENABLED !== "1" || !serviceId || !merchantId || !secret) return null;
  return { serviceId, merchantId, secret, merchantUserId: process.env.CLICK_MERCHANT_USER_ID?.trim() || undefined };
}

export function enabledProviders(): Provider[] {
  return [paymeConfig() ? "payme" : null, clickConfig() ? "click" : null].filter(Boolean) as Provider[];
}
