/**
 * Rough "how long will this take" for a catalogue row.
 *
 * Derived, never stored: no column holds a duration and the real timings live
 * inside each paper's own HTML. These are the IELTS exam allowances, so they are
 * a fair promise to a student choosing what to sit:
 *   - Reading: 20 minutes a passage, 60 for the full paper.
 *   - Listening: about 10 minutes a section, about 40 for the full recording
 *     (the exam's extra 10 minutes to transfer answers is not counted).
 *
 * Imports nothing, so it stays safe in a client component and unit-testable.
 */
export function estimatedMinutes(
  skill: "reading" | "listening",
  kind: "single" | "full",
): number {
  if (skill === "reading") return kind === "full" ? 60 : 20;
  return kind === "full" ? 40 : 10;
}
