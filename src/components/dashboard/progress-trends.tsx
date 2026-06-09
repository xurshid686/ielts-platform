"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

export type BandPoint = { band: number; at: string };

const SKILL_META: Record<string, { label: string; color: string }> = {
  reading: { label: "Reading", color: "var(--primary)" },
  listening: { label: "Listening", color: "var(--accent)" },
  speaking: { label: "Speaking", color: "var(--danger)" },
  writing: { label: "Writing", color: "var(--warning)" },
};

const ORDER = ["reading", "listening", "speaking", "writing"];

// Multi-skill band trend with a per-skill toggle. Each series must be in
// chronological order (oldest first). Skills with no data are hidden; a skill
// needs at least two points to draw a line.
export function ProgressTrends({ series }: { series: Record<string, BandPoint[]> }) {
  const available = ORDER.filter((s) => (series[s]?.length ?? 0) >= 1);
  const firstDrawable = available.find((s) => (series[s]?.length ?? 0) >= 2);
  const [active, setActive] = useState(firstDrawable ?? available[0] ?? "reading");

  const points = series[active] ?? [];
  const meta = SKILL_META[active] ?? SKILL_META.reading;

  const chart = useMemo(() => buildChart(points), [points]);

  if (available.length === 0) {
    return (
      <Card>
        <h3 className="text-sm font-medium text-muted">Band trend</h3>
        <p className="mt-6 mb-4 text-center text-sm text-muted">
          Complete tests to see your band progress over time.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">Band trend</h3>
        <div className="flex flex-wrap gap-1">
          {available.map((s) => {
            const on = s === active;
            return (
              <button
                key={s}
                onClick={() => setActive(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {SKILL_META[s].label}
              </button>
            );
          })}
        </div>
      </div>

      {chart ? (
        <>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-muted">
              Latest <strong className="text-foreground tabular-nums">Band {chart.latest}</strong>
            </span>
            <span
              className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${
                chart.delta > 0 ? "text-success" : chart.delta < 0 ? "text-danger" : "text-muted"
              }`}
            >
              {chart.delta > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : chart.delta < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <Minus className="h-4 w-4" />
              )}
              {chart.delta > 0 ? `+${chart.delta}` : chart.delta} band
            </span>
          </div>

          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            className="mt-3 h-auto w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${meta.label} band trend, latest ${chart.latest}`}
          >
            <defs>
              <linearGradient id={`fill-${active}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: meta.color, stopOpacity: 0.18 }} />
                <stop offset="100%" style={{ stopColor: meta.color, stopOpacity: 0 }} />
              </linearGradient>
            </defs>

            {chart.gridBands.map((b) => (
              <g key={b} className="text-border">
                <line
                  x1={chart.padL}
                  x2={chart.W - chart.padR}
                  y1={chart.y(b)}
                  y2={chart.y(b)}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <text
                  x={chart.padL - 8}
                  y={chart.y(b) + 3}
                  textAnchor="end"
                  className="fill-muted text-[10px]"
                >
                  {b}
                </text>
              </g>
            ))}

            <path d={chart.area} fill={`url(#fill-${active})`} />
            <path
              d={chart.line}
              fill="none"
              stroke={meta.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {points.map((p, i) => {
              const last = i === points.length - 1;
              return (
                <circle
                  key={i}
                  cx={chart.x(i)}
                  cy={chart.y(p.band)}
                  r={last ? 5 : 3.5}
                  fill={meta.color}
                  strokeWidth={2}
                  className="stroke-surface"
                >
                  <title>
                    Band {p.band} · {fmt(p.at)}
                  </title>
                </circle>
              );
            })}

            <text x={chart.padL} y={chart.H - 6} textAnchor="start" className="fill-muted text-[10px]">
              {fmt(points[0].at)}
            </text>
            <text x={chart.W - chart.padR} y={chart.H - 6} textAnchor="end" className="fill-muted text-[10px]">
              {fmt(points[points.length - 1].at)}
            </text>
          </svg>
        </>
      ) : (
        <p className="mt-6 mb-4 text-center text-sm text-muted">
          Take at least two {meta.label.toLowerCase()} tests to see a line graph.
        </p>
      )}
    </Card>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildChart(points: BandPoint[]) {
  if (points.length < 2) return null;

  const W = 560;
  const H = 200;
  const padL = 30;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const bands = points.map((p) => p.band);
  let lo = Math.max(0, Math.floor(Math.min(...bands) - 0.5));
  let hi = Math.min(9, Math.ceil(Math.max(...bands) + 0.5));
  if (hi - lo < 2) {
    hi = Math.min(9, lo + 2);
    lo = Math.max(0, hi - 2);
  }

  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (b: number) => padT + innerH - ((b - lo) / (hi - lo)) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.band).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${(padT + innerH).toFixed(
    1,
  )} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const gridBands: number[] = [];
  for (let b = lo; b <= hi; b++) gridBands.push(b);

  const latest = points[points.length - 1].band;
  const prev = points[points.length - 2].band;
  const delta = +(latest - prev).toFixed(1);

  return { W, H, padL, padR, x, y, line, area, gridBands, latest, delta };
}
