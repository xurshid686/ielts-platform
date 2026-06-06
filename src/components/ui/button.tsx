import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95 active:translate-y-px",
  outline:
    "border border-border bg-surface shadow-soft hover:bg-surface-2 hover:border-primary/30 text-foreground active:translate-y-px",
  ghost: "hover:bg-surface-2 text-foreground active:translate-y-px",
  danger: "bg-danger text-white shadow-soft hover:opacity-95 active:translate-y-px",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  icon: "h-10 w-10",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
