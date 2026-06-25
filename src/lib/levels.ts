import type { Level } from "@/types/database";

/** A beginner track that has its own menu + materials library.
 *  ('speaking_only' is a restriction, not a content track, so it's excluded.) */
export type ContentLevel = Exclude<Level, "regular" | "speaking_only">;

type LevelMeta = {
  /** URL slug used in /pre-ielts, /intro and admin filters. */
  slug: ContentLevel;
  /** Sidebar + page heading label. */
  label: string;
  /** Short description shown on the level's landing page. */
  blurb: string;
  /** Path to the student-facing materials page. */
  href: string;
};

export const LEVELS: Record<ContentLevel, LevelMeta> = {
  pre_ielts: {
    slug: "pre_ielts",
    label: "Pre-IELTS",
    blurb: "Foundation reading and listening tests to get you ready for IELTS.",
    href: "/pre-ielts",
  },
  intro: {
    slug: "intro",
    label: "Introduction",
    blurb: "Gentle introductory reading and listening tests to ease you into the IELTS format.",
    href: "/intro",
  },
};

/** All content levels in display order (lowest first). */
export const CONTENT_LEVELS: ContentLevel[] = ["pre_ielts", "intro"];

/** All assignable levels, including the default 'regular', in display order. */
export const ALL_LEVELS: { value: Level; label: string }[] = [
  { value: "regular", label: "Regular IELTS" },
  { value: "pre_ielts", label: "Pre-IELTS" },
  { value: "intro", label: "Introduction" },
  { value: "speaking_only", label: "Speaking only" },
];

export function levelLabel(level: Level | string): string {
  return ALL_LEVELS.find((l) => l.value === level)?.label ?? "Regular IELTS";
}

export function isContentLevel(level: Level): level is ContentLevel {
  return level === "pre_ielts" || level === "intro";
}

/**
 * Speaking-only students may use the Speaking section and nothing else.
 * Gated centrally in proxy.ts and reflected in the sidebar (app-shell).
 */
export function isSpeakingOnly(profile: { level?: Level | string | null }): boolean {
  return profile.level === "speaking_only";
}

/** App routes a speaking-only student is allowed to open (prefix match).
 *  Includes /api/live-token, which the live voice session fetches. */
export const SPEAKING_ONLY_ALLOWED = ["/speaking", "/api/live-token", "/auth/signout", "/u"];

/** Where a speaking-only student is sent for anything else. */
export const SPEAKING_ONLY_HOME = "/speaking";

/**
 * Can this profile see/open a test of the given track?
 * Regular tests are open to everyone; level tests only to matching students
 * (admins always pass so they can review). A missing track defaults to regular.
 */
export function canAccessTrack(
  profile: { role: string; level?: Level | string | null },
  track: Level | string | null | undefined,
): boolean {
  const t = (track ?? "regular") as Level;
  if (t === "regular") return true;
  if (profile.role === "admin") return true;
  return profile.level === t;
}
