import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 shadow-soft",
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-medium text-muted", className)} {...props} />;
}
