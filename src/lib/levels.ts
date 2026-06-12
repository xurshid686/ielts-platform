import type { Level } from "@/types/database";

/** A beginner track that has its own menu + materials library. */
export type ContentLevel = Exclude<Level, "regular">;

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
];

export function levelLabel(level: Level | string): string {
  return ALL_LEVELS.find((l) => l.value === level)?.label ?? "Regular IELTS";
}

export function isContentLevel(level: Level): level is ContentLevel {
  return level === "pre_ielts" || level === "intro";
}

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
