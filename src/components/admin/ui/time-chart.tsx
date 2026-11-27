"use client";

import { useId, useState } from "react";

// One series per chart, one axis (the dataviz rule: two measures of different
// scale are two charts). Bars for per-day counts, a 2px line for rates that
// move smoothly. Recessive grid, a crosshair/tooltip on hover and focus, and a
// visually hidden table so the numbers are reachable without the picture.

export type Point = { day: string; value: number };

const W = 640;
const H = 180;
const PAD = { l: 36, r: 8, t: 10, b: 22 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function short(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function TimeChart({
  points,
  kind = "bar",
  unit = "",
  format = (n: number) => n.toLocaleString("en-US"),
  label,
}: {
  points: Point[];
  kind?: "bar" | "line";
  unit?: string;
  format?: (n: number) => string;
  /** Accessible name; the panel title usually says the same thing visually. */
  label: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const step = n > 0 ? iw / n : iw;
  const x = (i: number) => PAD.l + step * i + step / 2;
  const y = (v: number) => PAD.t + ih - (max > 0 ? (v / max) * ih : 0);
  const barW = Math.max(2, Math.min(18, step - 2)); // 2px surface gap between bars
  const ticks = [0, max / 2, max];
  // ~6 date labels whatever the range.
  const every = Math.max(1, Math.ceil(n / 6));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const h = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-labelledby={`${id}-t`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.floor((px - PAD.l) / step);
          setHover(i >= 0 && i < n ? i : null);
        }}
      >
        <title id={`${id}-t`}>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={t === 0 ? undefined : "2 3"}
            />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {compact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={p.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {short(p.day)}
            </text>
          ) : null,
        )}

        {kind === "bar" &&
          points.map((p, i) => {
            const top = y(p.value);
            const hgt = PAD.t + ih - top;
            if (hgt <= 0) return null;
            const r = Math.min(4, barW / 2, hgt);
            const bx = x(i) - barW / 2;
            // Rounded data end, square at the baseline.
            const d = `M${bx},${PAD.t + ih} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + barW - r} Q${bx + barW},${top} ${bx + barW},${top + r} V${PAD.t + ih} Z`;
            return (
              <path
                key={p.day}
                d={d}
                fill="var(--primary)"
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            );
          })}

        {kind === "line" && n > 0 && (
          <>
            <path d={`${line} L${x(n - 1)},${PAD.t + ih} L${x(0)},${PAD.t + ih} Z`} fill="var(--primary)" opacity={0.08} />
            <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {h && hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
            {kind === "line" && (
              <circle cx={x(hover)} cy={y(h.value)} r={4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
            )}
          </g>
        )}
      </svg>

      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-elevated"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="text-muted">{short(h.day)}</p>
          <p className="font-semibold tabular-nums">
            {format(h.value)}
            {unit && <span className="font-normal text-muted"> {unit}</span>}
          </p>
        </div>
      )}

      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
