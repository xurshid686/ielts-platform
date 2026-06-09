import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { tierForRating } from "@/lib/rating";

export type RatingPoint = { rating: number; at: string };

// Dependency-free SVG line chart of competitive rating over time.
// `points` must be chronological (oldest first).
export function RatingTrend({ points }: { points: RatingPoint[] }) {
  if (points.length < 2) {
    return (
      <Card>
        <h3 className="text-sm font-medium text-muted">Rating history</h3>
        <p className="mt-6 mb-4 text-center text-sm text-muted">
          Finish two rated reading tests to see your rating climb here.
        </p>
      </Card>
    );
  }

  const W = 560;
  const H = 200;
  const padL = 38;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const ratings = points.map((p) => p.rating);
  let lo = Math.min(...ratings);
  let hi = Math.max(...ratings);
  // Pad the range and snap to 50s so gridlines look tidy.
  const pad = Math.max(50, Math.round((hi - lo) * 0.25));
  lo = Math.floor((lo - pad) / 50) * 50;
  hi = Math.ceil((hi + pad) / 50) * 50;
  if (hi - lo < 100) hi = lo + 100;

  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (r: number) => padT + innerH - ((r - lo) / (hi - lo)) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.rating).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${(padT + innerH).toFixed(
    1,
  )} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const gridlines: number[] = [];
  const step = (hi - lo) / 4;
  for (let r = lo; r <= hi + 1; r += step) gridlines.push(Math.round(r));

  const latest = points[points.length - 1].rating;
  const first = points[0].rating;
  const delta = latest - first;
  const tier = tierForRating(latest);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">Rating history</h3>
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
          {delta > 0 ? `+${delta}` : delta}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Now <strong className="text-foreground tabular-nums">{latest}</strong> · {tier.emoji}{" "}
        {tier.label}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Rating history, now ${latest}`}
      >
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.18 }} />
            <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {gridlines.map((r) => (
          <g key={r} className="text-border">
            <line
              x1={padL}
              x2={W - padR}
              y1={y(r)}
              y2={y(r)}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text x={padL - 8} y={y(r) + 3} textAnchor="end" className="fill-muted text-[10px]">
              {r}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#ratingFill)" className="text-primary" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
        />

        {points.map((p, i) => {
          const last = i === points.length - 1;
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.rating)}
              r={last ? 5 : 3}
              fill="currentColor"
              strokeWidth={2}
              className="text-primary stroke-surface"
            >
              <title>
                {p.rating} · {fmt(p.at)}
              </title>
            </circle>
          );
        })}

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
