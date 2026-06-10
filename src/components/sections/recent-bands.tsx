import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { avg } from "@/lib/utils";

export type RecentBandPoint = { band: number; at: string };

// Recent-bands line chart for a skill page. Server-rendered SVG: the band
// axis zooms to the user's actual range (so a 0.5-band move is visible),
// a dashed line marks the running average, and the personal best is ringed.
export function RecentBandsChart({
  points,
  color = "var(--primary)",
  avgColor = "var(--accent)",
}: {
  points: RecentBandPoint[];
  color?: string;
  /** Reference-line color — pick one that contrasts with `color`. */
  avgColor?: string;
}) {
  if (points.length < 2) return null;

  const W = 560;
  const H = 168;
  const padL = 38;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const bands = points.map((p) => p.band);
  const average = avg(bands)!;
  const best = Math.max(...bands);
  const latest = bands[bands.length - 1];
  const prev = bands[bands.length - 2];
  const delta = +(latest - prev).toFixed(1);

  // Y domain: hug the data (±0.5 padding), keep at least a 1.5-band span so a
  // flat run doesn't collapse, clamp to the 0–9 IELTS scale.
  let lo = Math.max(0, Math.floor((Math.min(...bands) - 0.5) * 2) / 2);
  let hi = Math.min(9, Math.ceil((Math.max(...bands) + 0.5) * 2) / 2);
  if (hi - lo < 1.5) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, mid - 0.75);
    hi = Math.min(9, lo + 1.5);
    lo = Math.max(0, hi - 1.5);
  }

  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (b: number) => padT + innerH - ((b - lo) / (hi - lo)) * innerH;

  // Half-band grid when zoomed in, whole bands when the range is wide.
  const step = hi - lo <= 2.5 ? 0.5 : 1;
  const gridBands: number[] = [];
  for (let b = Math.ceil(lo / step) * step; b <= hi + 1e-9; b += step) {
    gridBands.push(+b.toFixed(1));
  }

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.band).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(
    0,
  ).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  // Mark the most recent occurrence of the personal best.
  const bestIdx = bands.lastIndexOf(best);

  // Date labels: first, middle (when enough room), last.
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const midIdx = points.length >= 5 ? Math.floor((points.length - 1) / 2) : null;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted">
          <Activity className="h-4 w-4" /> Recent bands
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums">
            last {points.length}
          </span>
        </h3>
        <span
          className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${
            delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"
          }`}
        >
          {delta > 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : delta < 0 ? (
            <TrendingDown className="h-4 w-4" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
          {delta > 0 ? `+${delta}` : delta} vs previous
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Latest <strong className="text-foreground tabular-nums">Band {latest}</strong>
        </span>
        <span>
          Average <strong className="text-foreground tabular-nums">{average}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--warning)" }}
          />
          Best <strong className="text-foreground tabular-nums">{best}</strong>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label={`Recent band scores, latest ${latest}, average ${average}, best ${best}`}
      >
        <defs>
          <linearGradient id="recent-bands-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.18 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {/* Band grid */}
        {gridBands.map((b) => (
          <g key={b} className="text-border">
            <line
              x1={padL}
              x2={W - padR}
              y1={y(b)}
              y2={y(b)}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text x={padL - 8} y={y(b) + 3} textAnchor="end" className="fill-muted text-[10px]">
              {b % 1 === 0 ? b : b.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Average reference line */}
        <line
          x1={padL}
          x2={W - padR}
          y1={y(average)}
          y2={y(average)}
          stroke={avgColor}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          opacity={0.7}
        />
        <text
          x={W - padR}
          y={y(average) - 5}
          textAnchor="end"
          className="text-[10px] font-medium"
          fill={avgColor}
        >
          avg {average}
        </text>

        {/* Area + line */}
        <path d={area} fill="url(#recent-bands-fill)" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Points (best is ringed, latest is larger) */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          const isBest = i === bestIdx;
          return (
            <g key={i}>
              {isBest && (
                <circle
                  cx={x(i)}
                  cy={y(p.band)}
                  r={8}
                  fill="none"
                  stroke="var(--warning)"
                  strokeWidth={2}
                />
              )}
              <circle
                cx={x(i)}
                cy={y(p.band)}
                r={isLast ? 5 : 3.5}
                fill={color}
                strokeWidth={2}
                className="stroke-surface"
              >
                <title>
                  Band {p.band} · {fmt(p.at)}
                  {isBest ? " · personal best" : ""}
                </title>
              </circle>
            </g>
          );
        })}

        {/* Date axis */}
        <text x={padL} y={H - 6} textAnchor="start" className="fill-muted text-[10px]">
          {fmt(points[0].at)}
        </text>
        {midIdx != null && (
          <text x={x(midIdx)} y={H - 6} textAnchor="middle" className="fill-muted text-[10px]">
            {fmt(points[midIdx].at)}
          </text>
        )}
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-muted text-[10px]">
          {fmt(points[points.length - 1].at)}
        </text>
      </svg>
    </Card>
  );
}
