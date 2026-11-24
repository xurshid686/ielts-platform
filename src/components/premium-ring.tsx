import { Crown } from "lucide-react";

/**
 * The "shiny" paid-member avatar (owner, 2026-11-24): a slowly turning gold
 * ring and a crown. Wraps whatever avatar a screen already renders (photo or
 * initials). With `on` false it renders the child untouched, so call sites
 * stay one line. ACTIVE paid Premium only — a trial does not shine.
 * No hooks: usable from server and client components alike.
 */
export function PremiumRing({
  on,
  crown = "sm",
  inner = "bg-surface",
  children,
}: {
  on: boolean;
  crown?: "sm" | "md" | "lg" | "none";
  /** Solid colour behind the avatar (a see-through initials circle sits on it). */
  inner?: string;
  children: React.ReactNode;
}) {
  if (!on) return <>{children}</>;
  const box = crown === "lg" ? "h-7 w-7" : crown === "md" ? "h-5 w-5" : "h-4 w-4";
  const icon = crown === "lg" ? "h-4 w-4" : crown === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <span className="premium-ring" title="Premium member">
      <span className={`premium-ring-inner ${inner}`}>{children}</span>
      {crown !== "none" && (
        <span className={`premium-crown ${box}`} aria-label="Premium member">
          <Crown className={icon} />
        </span>
      )}
    </span>
  );
}
