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
    blurb:
      "Foundation materials to get you ready for IELTS — vocabulary task books, grammar and study basics.",
    href: "/pre-ielts",
  },
  intro: {
    slug: "intro",
    label: "Introduction",
    blurb:
      "Your gentle introduction to the IELTS exam — formats, question types and what to expect on test day.",
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
