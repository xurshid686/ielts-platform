"use client";

import { useRef, useState } from "react";

// The Writing split pane, and nothing else: task on the left, the answer on the
// right, a pointer-draggable divider between them, and the word count under the
// box. Lifted verbatim out of components/mock/writing-exam.tsx so the mock and
// the Task 2 practice screen cannot drift apart.
//
// PRESENTATION ONLY. No clock, no autosave, no routing, no exam guard, no
// submit, no violations — those belong to whichever controller is composing it,
// and the two controllers have deliberately different rules (the mock's clock
// hands the writing in; the practice clock does nothing at all).

// Inspera tokens (see the reading/listening players).
const INK = "#535353";
const TEAL = "#2a6c96";
const UNDER = "#b3261e";

export function WritingWorkspace({
  prompt,
  promptLabel,
  value,
  onChange,
  minWords,
  words,
  disabled,
  answerLabel,
  /** Remounts the textarea when the controller switches task. */
  answerKey,
  onPasteText,
}: {
  prompt: React.ReactNode;
  promptLabel: string;
  value: string;
  onChange: (next: string) => void;
  minWords: number;
  words: number;
  disabled?: boolean;
  answerLabel: string;
  answerKey?: string | number;
  /** The pasted or dropped text, before it lands. Optional — practice ignores it. */
  onPasteText?: (text: string) => void;
}) {
  const [leftPct, setLeftPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  function onDividerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onDividerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !splitRef.current) return;
    const r = splitRef.current.getBoundingClientRect();
    setLeftPct(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100)));
  }

  return (
    <div
      ref={splitRef}
      className="relative flex min-h-0 flex-1 flex-col md:flex-row"
      style={{ cursor: dragging ? "col-resize" : undefined }}
    >
      <section
        className="min-w-0 overflow-y-auto px-6 py-5 md:[width:var(--left)]"
        style={{ "--left": `${leftPct}%` } as React.CSSProperties}
        aria-label={promptLabel}
      >
        {prompt}
      </section>

      {/* Hidden on a phone, where the two panes stack and there is nothing to drag. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        onPointerDown={onDividerDown}
        onPointerMove={onDividerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className="relative hidden w-2 shrink-0 cursor-col-resize bg-black/10 touch-none md:block"
      >
        <div
          className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[3px] bg-[#f9f9f9] text-sm select-none hover:bg-[#e1e1e1]"
          style={{ border: `2px solid ${dragging ? TEAL : INK}`, color: dragging ? TEAL : INK }}
          aria-hidden
        >
          ↔
        </div>
      </div>

      <section className="flex min-h-[40vh] min-w-0 flex-1 flex-col px-6 py-5">
        <textarea
          key={answerKey}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-label={answerLabel}
          onPaste={onPasteText ? (e) => onPasteText(e.clipboardData.getData("text")) : undefined}
          onDrop={onPasteText ? (e) => onPasteText(e.dataTransfer.getData("text")) : undefined}
          className="min-h-0 w-full flex-1 resize-none rounded-[3px] bg-white p-3 text-[16px] leading-relaxed text-black outline-none focus:shadow-[0_0_0_2px_rgba(42,108,150,0.35)]"
          style={{ border: `0.8px solid ${INK}` }}
        />
        <p
          className="mt-2 text-right text-sm tabular-nums"
          style={{ color: words < minWords ? UNDER : INK }}
        >
          Words: {words}
        </p>
      </section>
    </div>
  );
}
