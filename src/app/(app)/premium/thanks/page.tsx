import { requireProfile } from "@/lib/auth";
import { orderStatus } from "@/app/actions/payments";
import { PaymentStatus } from "@/components/premium/payment-status";

export const metadata = { title: "Payment", robots: { index: false } };

/**
 * Where Payme/Click send the student back (0073). The provider's webhook, not
 * this page, is what pays the order, so this only SHOWS the order's state and
 * polls until the webhook has landed.
 */
export default async function PaymentThanksPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requireProfile();
  const { order } = await searchParams;
  const initial = order ? await orderStatus(order) : null;
  return (
    <div className="mx-auto max-w-md py-12">
      <PaymentStatus orderId={order ?? ""} initial={initial} />
    </div>
  );
}
