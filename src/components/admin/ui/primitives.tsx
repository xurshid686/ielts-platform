import Link from "next/link";
import { cn } from "@/lib/utils";

/** A bordered section with a header row. The admin panel's basic container. */
export function Panel({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-soft", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "premium";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/12 text-danger",
  premium: "bg-premium/15 text-premium",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A KPI: label, big number, change against the previous window. */
export function StatTile({
  label,
  value,
  delta,
  hint,
  href,
  invert = false,
  deltaUnit = "%",
}: {
  deltaUnit?: "%" | " pts";
  label: string;
  value: React.ReactNode;
  /** Percent change, or null for "no previous data". Omit for no delta line. */
  delta?: number | null;
  hint?: React.ReactNode;
  href?: string;
  /** For numbers where DOWN is good. */
  invert?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {delta !== undefined && <DeltaChip delta={delta} invert={invert} unit={deltaUnit} />}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </>
  );
  const cls = "block rounded-2xl border border-border bg-surface p-4 shadow-soft";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function DeltaChip({ delta, invert = false, unit = "%" }: { delta: number | null; invert?: boolean; unit?: string }) {
  if (delta == null)
    return (
      <span className="text-muted" title="Nothing in the previous period to compare with">
        new
      </span>
    );
  const good = invert ? delta < 0 : delta > 0;
  const bad = invert ? delta > 0 : delta < 0;
  // Arrow + sign + word carry the meaning; colour only repeats it.
  return (
    <span
      className={cn("font-medium tabular-nums", good && "text-success", bad && "text-danger")}
      title="Change against the previous period of the same length"
    >
      {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : delta < 0 ? "−" : ""}
      {Math.abs(delta)}
      {unit}
    </span>
  );
}

/** Segmented links that keep the rest of the URL. */
export function Segmented({
  options,
  value,
  hrefFor,
  label,
}: {
  options: { id: string; label: string }[];
  value: string;
  hrefFor: (id: string) => string;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => (
        <Link
          key={o.id}
          href={hrefFor(o.id)}
          aria-current={o.id === value ? "true" : undefined}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            o.id === value ? "bg-foreground text-background" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted">{children}</p>;
}
