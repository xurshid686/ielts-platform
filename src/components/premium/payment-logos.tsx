/**
 * Payme / Click logos (official files from cdn.payme.uz and click.uz, saved in
 * public/payments). Click's wordmark is WHITE, made for a dark background, so
 * both sit on a dark chip, untouched, rather than recoloured. No hooks: safe in
 * server and client components.
 */
export type PayProvider = "payme" | "click";

const LOGO: Record<PayProvider, { src: string; alt: string; ratio: number }> = {
  payme: { src: "/payments/payme.svg", alt: "Payme", ratio: 58 / 20 },
  click: { src: "/payments/click.svg", alt: "Click", ratio: 157 / 40 },
};

export function PaymentLogo({ provider, height = 18 }: { provider: PayProvider; height?: number }) {
  const l = LOGO[provider];
  return (
    <span className="inline-flex items-center rounded-lg bg-[#0f1729] px-2.5 py-1.5 ring-1 ring-black/10">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
      <img src={l.src} alt={l.alt} height={height} width={Math.round(height * l.ratio)} style={{ height, width: "auto" }} />
    </span>
  );
}
