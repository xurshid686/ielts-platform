import { criteriaProfile, type AiTaskResult } from "@/lib/writing-ai-shared";

// Dependency-free SVG charts for a saved AI writing report. Pure markup (no hooks),
// so they render on the server and print cleanly. Colours are the site tokens, so
// they follow light and dark mode; every chart also carries its numbers as text,
// so colour is never the only signal.

const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));
// Math.cos/sin can differ in the last digit between Node and the browser, and an
// unrounded coordinate in an attribute then fails hydration. Round every one.
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A big overall band on a half-ring dial, with an optional target tick. */
export function BandGauge({ band, target }: { band: number | null; target?: number | null }) {
  const R = 86;
  const CX = 110;
  const CY = 104;
  // 0 -> left end, 9 -> right end of the upper half circle.
  const at = (b: number, r = R) => {
    const a = Math.PI - (Math.min(9, Math.max(0, b)) / 9) * Math.PI;
    return { x: r2(CX + r * Math.cos(a)), y: r2(CY - r * Math.sin(a)) };
  };
  const arc = (from: number, to: number) => {
    const s = at(from);
    const e = at(to);
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const tick = target != null && target > 0 ? { a: at(target, R - 12), b: at(target, R + 12) } : null;

  return (
    <figure className="mx-auto w-full max-w-[260px]" data-band-gauge>
      <svg
        viewBox="0 0 220 128"
        className="h-auto w-full"
        role="img"
        aria-label={`Overall AI estimate: band ${fmt(band)} out of 9${target ? `, your target is ${target.toFixed(1)}` : ""}`}
      >
        <path d={arc(0, 9)} fill="none" strokeWidth={16} strokeLinecap="round" className="stroke-surface-2" />
        {band != null && band > 0 && (
          <path d={arc(0, band)} fill="none" strokeWidth={16} strokeLinecap="round" className="stroke-primary" />
        )}
        {tick && (
          <line
            x1={tick.a.x}
            y1={tick.a.y}
            x2={tick.b.x}
            y2={tick.b.y}
            strokeWidth={3}
            strokeLinecap="round"
            className="stroke-premium"
          />
        )}
        <text x={CX} y={CY - 8} textAnchor="middle" className="fill-foreground text-[44px] font-bold tabular-nums">
          {fmt(band)}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-muted text-xs">
          AI estimate · out of 9
        </text>
        <text x={CX - R} y={CY + 14} textAnchor="middle" className="fill-muted text-xs">
          0
        </text>
        <text x={CX + R} y={CY + 14} textAnchor="middle" className="fill-muted text-xs">
          9
        </text>
      </svg>
      {tick && (
        <figcaption className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-premium" />
          Your target: band {target?.toFixed(1)}
        </figcaption>
      )}
    </figure>
  );
}

/** The four criteria as a radar. Task / Coherence / Vocabulary / Grammar, 0 to 9. */
export function CriteriaRadar({ results, target }: { results: AiTaskResult[]; target?: number | null }) {
  const axes = criteriaProfile(results);
  const W = 330;
  const H = 290;
  const CX = W / 2;
  const CY = H / 2 + 4;
  const R = 80;
  // top, right, bottom, left
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI) / 2;
  const pt = (i: number, b: number) => ({
    x: r2(CX + (b / 9) * R * Math.cos(angle(i))),
    y: r2(CY + (b / 9) * R * Math.sin(angle(i))),
  });
  const ring = (b: number) =>
    axes.map((_, i) => pt(i, b)).map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

  const shape = axes.map((a, i) => pt(i, a.band ?? 0));
  const poly = shape.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

  // Two-line labels (name, then band) just outside each axis tip: short lines keep
  // the type readable when the chart is scaled down on a phone.
  const label = (i: number) => {
    const o = pt(i, 9);
    if (i === 0) return { x: o.x, y: o.y - 20, anchor: "middle" as const };
    if (i === 2) return { x: o.x, y: o.y + 16, anchor: "middle" as const };
    return { x: r2(o.x + (i === 1 ? 12 : -12)), y: o.y - 3, anchor: i === 1 ? ("start" as const) : ("end" as const) };
  };

  return (
    <figure className="mx-auto w-full max-w-[380px]" data-criteria-radar>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Criteria: ${axes.map((a) => `${a.label} ${fmt(a.band == null ? null : Math.round(a.band * 2) / 2)}`).join(", ")}`}
      >
        {[3, 6, 9].map((b) => (
          <path key={b} d={ring(b)} fill="none" strokeWidth={1} strokeDasharray={b === 9 ? undefined : "3 4"} className="stroke-border" />
        ))}
        {axes.map((_, i) => {
          const o = pt(i, 9);
          return <line key={i} x1={CX} y1={CY} x2={o.x} y2={o.y} strokeWidth={1} className="stroke-border" />;
        })}
        {[3, 6].map((b) => (
          <text key={b} x={CX + 4} y={CY - (b / 9) * R + 11} className="fill-muted text-xs">
            {b}
          </text>
        ))}

        {target != null && target > 0 && (
          <path d={ring(target)} fill="none" strokeWidth={2} strokeDasharray="5 4" className="stroke-premium" />
        )}
        <path d={poly} strokeWidth={2.5} strokeLinejoin="round" className="fill-primary/20 stroke-primary" />
        {shape.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4.5} strokeWidth={2} className="fill-primary stroke-surface">
            {/* One string: React 19 warns on a <title> with several text children. */}
            <title>{`${axes[i].label}: ${fmt(axes[i].band == null ? null : Math.round((axes[i].band as number) * 2) / 2)}`}</title>
          </circle>
        ))}

        {axes.map((a, i) => {
          const l = label(i);
          return (
            <text key={a.key} x={l.x} y={l.y} textAnchor={l.anchor} className="fill-foreground text-[13px]">
              <tspan x={l.x}>{a.label}</tspan>
              <tspan x={l.x} dy={15} className="font-bold">
                {fmt(a.band == null ? null : Math.round(a.band * 2) / 2)}
              </tspan>
            </text>
          );
        })}
      </svg>
      {target != null && target > 0 && (
        <figcaption className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-premium" />
          Dashed line: your target, band {target.toFixed(1)}
        </figcaption>
      )}
    </figure>
  );
}

/** Four horizontal 0-9 bars, with a tick where the student's target sits. */
export function CriteriaTargetBars({ results, target }: { results: AiTaskResult[]; target?: number | null }) {
  const axes = criteriaProfile(results);
  return (
    <div className="space-y-3" data-criteria-bars>
      {axes.map((a) => {
        const band = a.band == null ? null : Math.round(a.band * 2) / 2;
        const pct = band == null ? 0 : (band / 9) * 100;
        const short = target != null && band != null && band < target;
        return (
          <div key={a.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">{a.label}</span>
              <span className="font-semibold tabular-nums">
                {fmt(band)}
                {short && <span className="ml-2 text-xs font-normal text-muted">{(target - band).toFixed(1)} to target</span>}
              </span>
            </div>
            <div
              className="relative h-2.5 rounded-full bg-surface-2"
              role="meter"
              aria-label={a.label}
              aria-valuemin={0}
              aria-valuemax={9}
              aria-valuenow={band ?? 0}
            >
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
              {target != null && target > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-1 w-0.5 rounded bg-premium"
                  style={{ left: `calc(${(target / 9) * 100}% - 1px)`, height: "18px" }}
                />
              )}
            </div>
          </div>
        );
      })}
      {target != null && target > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="inline-block h-3 w-0.5 rounded bg-premium" />
          Your target: band {target.toFixed(1)}
        </p>
      )}
    </div>
  );
}

/** A tiny radar for list rows: shape only, the numbers live next to it. */
export function MiniRadar({ results }: { results: AiTaskResult[] }) {
  const axes = criteriaProfile(results);
  const S = 44;
  const C = S / 2;
  const R = 18;
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI) / 2;
  const pt = (i: number, b: number) => ({ x: r2(C + (b / 9) * R * Math.cos(angle(i))), y: r2(C + (b / 9) * R * Math.sin(angle(i))) });
  const path = (bands: number[]) => bands.map((b, i) => pt(i, b)).map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-11 w-11 shrink-0" aria-hidden>
      <path d={path([9, 9, 9, 9])} fill="none" strokeWidth={1} className="stroke-border" />
      <path d={path([4.5, 4.5, 4.5, 4.5])} fill="none" strokeWidth={1} strokeDasharray="2 2" className="stroke-border" />
      <path d={path(axes.map((a) => a.band ?? 0))} strokeWidth={1.5} strokeLinejoin="round" className="fill-primary/25 stroke-primary" />
    </svg>
  );
}
