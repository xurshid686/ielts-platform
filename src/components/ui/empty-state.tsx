import { cn } from "@/lib/utils";

// Friendly placeholder for "nothing here yet" moments: an icon chip, a short
// explanation, and ideally one clear action that fills the space with data.
export function EmptyState({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {desc && <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
