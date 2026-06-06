import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

export type BandPoint = { band: number; at: string };

// A small dependency-free SVG line chart of band scores over time.
// `points` must be in chronological order (oldest first).
export function BandTrend({
  points,
  title = "Reading band trend",
}: {
  points: BandPoint[];
  title?: string;
}) {
  if (points.length < 2) {
    return (
      <Card>
        <h3 className="text-sm font-medium text-muted">{title}</h3>
        <p className="mt-6 mb-4 text-center text-sm text-muted">
          Take at least two reading tests to see your progress as a line graph.
        </p>
      </Card>
    );
  }

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

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const latest = points[points.length - 1].band;
  const prev = points[points.length - 2].band;
  const delta = +(latest - prev).toFixed(1);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">{title}</h3>
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
          {delta > 0 ? `+${delta}` : delta} band
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: latest band ${latest}`}
      >
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.18 }} />
            <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + Y labels */}
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
            <text
              x={padL - 8}
              y={y(b) + 3}
              textAnchor="end"
              className="fill-muted text-[10px]"
            >
              {b}
            </text>
          </g>
        ))}

        {/* Area + line */}
        <path d={area} fill="url(#bandFill)" className="text-primary" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
        />

        {/* Points (last one emphasised) with native hover tooltips */}
        {points.map((p, i) => {
          const last = i === points.length - 1;
          return (
            <g key={i} className="text-primary">
              <circle
                cx={x(i)}
                cy={y(p.band)}
                r={last ? 5 : 3.5}
                fill="currentColor"
                strokeWidth={2}
                className="stroke-surface"
              >
                <title>
                  Band {p.band} · {fmt(p.at)}
                </title>
              </circle>
            </g>
          );
        })}

        {/* X labels: first and last date */}
        <text x={padL} y={H - 6} textAnchor="start" className="fill-muted text-[10px]">
          {fmt(points[0].at)}
        </text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-muted text-[10px]">
          {fmt(points[points.length - 1].at)}
        </text>
      </svg>
    </Card>
  );
}
