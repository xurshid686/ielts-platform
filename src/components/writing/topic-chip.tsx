import { topicOf, topicStyle } from "@/lib/writing-practice-topics";

/**
 * A topic's colour AND its name — the colour is never the only signal, so the
 * catalogue still reads correctly to anyone who cannot tell two of them apart.
 * The colours themselves live in globals.css, one CSS variable per topic, with
 * a light and a dark value.
 */
export function TopicChip({
  topic,
  count,
  className,
}: {
  topic: string;
  count?: number;
  className?: string;
}) {
  const t = topicOf(topic);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className ?? ""}`}
      style={topicStyle(topic)}
    >
      {t.label}
      {count != null && <span className="font-normal opacity-70 tabular-nums">{count}</span>}
    </span>
  );
}
