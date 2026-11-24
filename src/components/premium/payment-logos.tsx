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

/**
 * "Soon: pay with Payme / Click" under a plan's Telegram button, for providers
 * not switched on yet (owner, 2026-11-24). Not a button: nothing to click.
 */
export function ComingSoonPayments({ providers }: { providers: PayProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="Online payment coming soon">
      <span className="text-xs text-muted">Soon: pay with</span>
      {providers.map((p) => (
        <span key={p} aria-disabled="true" className="opacity-75" title={`${LOGO[p].alt}: coming soon`}>
          <PaymentLogo provider={p} height={14} />
        </span>
      ))}
      <span className="rounded-full bg-premium/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-premium">
        Coming soon
      </span>
    </div>
  );
}
