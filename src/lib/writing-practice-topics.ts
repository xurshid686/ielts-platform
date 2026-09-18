// The 15 IELTS Writing Task 2 topics the @CDI_Report corpus is classified into
// (telegram-channel-map/wt2_topics.py). A fixed, small list, so it is a constant
// here rather than a table or a Postgres enum — the database pins the same ids
// with a CHECK constraint on writing_practice.topic (migration 0057), and that
// is what keeps the two from drifting.
//
// COLOURS ARE NEVER THE ONLY SIGNAL: every chip shows the topic's name too.
// Each id maps to a CSS variable defined in globals.css with a light and a dark
// value, because an inline hex cannot follow the theme.
//
// This file imports NOTHING, so both server components and client components
// can use it, and it is unit-testable without the `@/` alias.

export type TopicId =
  | "education"
  | "environment"
  | "health"
  | "technology"
  | "work-careers"
  | "family-children"
  | "media-advertising"
  | "crime-justice"
  | "government-policy"
  | "society-lifestyle"
  | "culture-traditions"
  | "economy-consumerism"
  | "travel-tourism"
  | "transport-urban"
  | "globalisation";

export type Topic = {
  id: TopicId;
  /** What the corpus calls it — the import script matches on this, exactly. */
  source: string;
  label: string;
  /** The CSS variable holding this topic's accent, light and dark. */
  cssVar: string;
};

export const TOPICS: readonly Topic[] = [
  { id: "education", source: "Education", label: "Education", cssVar: "--t-education" },
  { id: "environment", source: "Environment", label: "Environment", cssVar: "--t-environment" },
  { id: "health", source: "Health", label: "Health", cssVar: "--t-health" },
  { id: "technology", source: "Technology", label: "Technology", cssVar: "--t-technology" },
  { id: "work-careers", source: "Work & Careers", label: "Work & Careers", cssVar: "--t-work" },
  { id: "family-children", source: "Family & Children", label: "Family & Children", cssVar: "--t-family" },
  { id: "media-advertising", source: "Media & Advertising", label: "Media & Advertising", cssVar: "--t-media" },
  { id: "crime-justice", source: "Crime & Justice", label: "Crime & Justice", cssVar: "--t-crime" },
  {
    id: "government-policy",
    source: "Government & Public Policy",
    label: "Government & Policy",
    cssVar: "--t-government",
  },
  { id: "society-lifestyle", source: "Society & Lifestyle", label: "Society & Lifestyle", cssVar: "--t-society" },
  { id: "culture-traditions", source: "Culture & Traditions", label: "Culture & Traditions", cssVar: "--t-culture" },
  { id: "economy-consumerism", source: "Economy & Consumerism", label: "Economy & Consumerism", cssVar: "--t-economy" },
  { id: "travel-tourism", source: "Travel & Tourism", label: "Travel & Tourism", cssVar: "--t-travel" },
  { id: "transport-urban", source: "Transport & Urban Life", label: "Transport & Urban Life", cssVar: "--t-transport" },
  {
    id: "globalisation",
    source: "Globalisation & International Affairs",
    label: "Globalisation",
    cssVar: "--t-global",
  },
] as const;

export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((t) => t.id);

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const BY_SOURCE = new Map(TOPICS.map((t) => [t.source, t]));

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && BY_ID.has(value as TopicId);
}

// ---------------------------------------------------------------- Task 1 kinds
//
// What a Task 1 picture is (migration 0058). The database pins the same ids with
// a CHECK on writing_practice.chart. They borrow topic colours rather than adding
// fourteen new CSS variables; the chip always shows the name, so a shared colour
// is never ambiguous.

export type ChartId = "pie" | "bar" | "line" | "table" | "map" | "process" | "mixed";

export const CHARTS: readonly { id: ChartId; label: string; cssVar: string }[] = [
  { id: "pie", label: "Pie chart", cssVar: "--t-media" },
  { id: "bar", label: "Bar chart", cssVar: "--t-transport" },
  { id: "line", label: "Line graph", cssVar: "--t-environment" },
  { id: "table", label: "Table", cssVar: "--t-economy" },
  { id: "map", label: "Map", cssVar: "--t-travel" },
  { id: "process", label: "Process", cssVar: "--t-culture" },
  { id: "mixed", label: "Mixed charts", cssVar: "--t-government" },
] as const;

const CHART_BY_ID = new Map(CHARTS.map((c) => [c.id, c]));

export function isChartId(value: unknown): value is ChartId {
  return typeof value === "string" && CHART_BY_ID.has(value as ChartId);
}

/**
 * The topic (or Task 1 chart kind), or a grey fallback — an unknown id must
 * render, never throw.
 */
export function topicOf(id: string | null | undefined): Topic {
  const key = id ?? "";
  const topic = BY_ID.get(key as TopicId);
  if (topic) return topic;
  const chart = CHART_BY_ID.get(key as ChartId);
  if (chart) return { id: key as TopicId, source: chart.label, label: chart.label, cssVar: chart.cssVar };
  return { id: key as TopicId, source: key, label: key || "Task 1", cssVar: "--t-unknown" };
}

/** Maps the corpus's own topic name ("Work & Careers") to our id. */
export function topicFromSource(source: string): Topic | undefined {
  return BY_SOURCE.get(source.trim());
}

/**
 * The three colours a chip needs, as `color-mix()` over the topic's variable,
 * so one definition follows the theme. Tailwind v4 already requires a browser
 * with `color-mix`.
 */
export function topicStyle(id: string | null | undefined): { color: string; background: string; borderColor: string } {
  const v = `var(${topicOf(id).cssVar})`;
  return {
    color: v,
    background: `color-mix(in srgb, ${v} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${v} 34%, transparent)`,
  };
}
