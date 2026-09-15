import {
  TASK1_SUMMARISE,
  TASK2_INTRO,
  TASK2_REASONS,
  parseTask1,
  parseTask2,
  wordsLine,
} from "@/lib/ielts/writing-prompt";

// Inline, not a border utility: the app's base layer recolours borders.
const BOX = { border: "1px solid #8a8a8a" } as const;

/**
 * A Writing task in the Cambridge layout (v3), built from the owner's raw text:
 * Task 1 = topic sentence (+ picture), Task 2 = question. Shared by the student
 * screen, the admin preview and the admin attempt page, so all three match.
 * Colours are fixed (the exam surface is always white, like the CDI players).
 */
export function WritingPrompt({
  task,
  raw,
  imageUrl,
  className,
}: {
  task: 1 | 2;
  raw: string | null | undefined;
  imageUrl?: string | null;
  className?: string;
}) {
  if (task === 1) {
    const { topic } = parseTask1(raw);
    return (
      <div className={`space-y-4 text-[16px] leading-relaxed text-black ${className ?? ""}`} style={{ fontFamily: "Arial, sans-serif" }}>
        <div className="space-y-3 p-4" style={BOX}>
          <p className="font-bold">{topic || "—"}</p>
          <p>{TASK1_SUMMARISE}</p>
        </div>
        <p>{wordsLine(1)}</p>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
          <img src={imageUrl} alt="Writing Task 1 picture" className="block h-auto max-w-full border border-[#dddddd] bg-white" draggable={false} />
        )}
      </div>
    );
  }
  const { statement, question } = parseTask2(raw);
  return (
    <div className={`space-y-4 text-[16px] leading-relaxed text-black ${className ?? ""}`} style={{ fontFamily: "Arial, sans-serif" }}>
      <p>{TASK2_INTRO}</p>
      <div className="space-y-3 p-4" style={BOX}>
        <p className="font-bold">{statement || "—"}</p>
        {question && <p>{question}</p>}
      </div>
      <p>{TASK2_REASONS}</p>
      <p>{wordsLine(2)}</p>
    </div>
  );
}
