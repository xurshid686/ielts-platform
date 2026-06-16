import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a user-supplied post-auth redirect target. Only same-origin
 * relative paths are allowed; anything else (absolute URLs, protocol-relative
 * `//host`, backslash tricks) falls back to the default to prevent open redirects.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// Counts activity timestamps falling in the current vs previous 7-day window.
export function weeklyActivity(dates: string[]): { thisWeek: number; lastWeek: number } {
  const now = Date.now();
  const WEEK = 7 * 86_400_000;
  const inRange = (iso: string, from: number, to: number) => {
    const t = new Date(iso).getTime();
    return t >= from && t < to;
  };
  return {
    thisWeek: dates.filter((d) => inRange(d, now - WEEK, now + 1)).length,
    lastWeek: dates.filter((d) => inRange(d, now - 2 * WEEK, now - WEEK)).length,
  };
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
