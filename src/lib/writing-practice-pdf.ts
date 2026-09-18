"use client";

import { promptLines } from "@/lib/ielts/writing-prompt";
import { countWords } from "@/lib/mock-shared";
import { topicOf } from "@/lib/writing-practice-topics";
import { fit, toDataUrl } from "@/lib/writing-pdf";

export type PracticePdfInput = {
  studentName: string;
  kind: "task1" | "task2" | "full";
  /** Task 2's topic, or the Task 1 chart kind. */
  topic: string | null;
  prompt: string;
  /** Task 1 / Full: the signed picture URL. */
  imageUrl: string | null;
  answer: string;
  /** Full only: the paired Task 2. */
  prompt2: string | null;
  topic2: string | null;
  answer2: string;
  submittedAt: string | null;
};

const TITLE = { task1: "IELTS Writing Task 1 — practice", task2: "IELTS Writing Task 2 — practice", full: "IELTS Writing — full practice test" };
const FILE = { task1: "Task1", task2: "Task2", full: "Full" };

/**
 * The student's copy of a practice sitting: each task in full Cambridge
 * wording (with the Task 1 picture), their answer, the word count, the date.
 * Built in the browser from the SUBMITTED attempt's snapshot, so the copy
 * downloaded straight after handing in and the one downloaded from history
 * months later are the same document.
 *
 * NEVER a band. Practice is not marked — there is nothing to put there. The
 * mock's renderer (lib/writing-pdf.ts) is left alone: it is live exam code;
 * only its picture helpers are shared.
 */
export async function downloadPracticePdf(input: PracticePdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const width = W - 2 * M;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, size = 11, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lh = size * 0.45;
    for (const line of doc.splitTextToSize(s, width) as string[]) {
      ensure(lh);
      doc.text(line, M, y);
      y += lh;
    }
  };
  const gap = (h = 3) => {
    y += h;
  };

  const when = input.submittedAt ? new Date(input.submittedAt) : new Date();
  const label = input.kind === "full" ? "Task 1 + Task 2" : topicOf(input.topic).label;

  text(TITLE[input.kind], 16, "bold");
  gap(1);
  text(`${label} · ${input.studentName || "Student"} · ${when.toLocaleString()}`, 10);
  gap(5);

  const image = input.kind !== "task2" && input.imageUrl ? await toDataUrl(input.imageUrl) : null;

  const tasks: { task: 1 | 2; prompt: string; answer: string }[] =
    input.kind === "task1"
      ? [{ task: 1, prompt: input.prompt, answer: input.answer }]
      : input.kind === "task2"
        ? [{ task: 2, prompt: input.prompt, answer: input.answer }]
        : [
            { task: 1, prompt: input.prompt, answer: input.answer },
            { task: 2, prompt: input.prompt2 ?? "", answer: input.answer2 },
          ];

  tasks.forEach(({ task, prompt, answer }, i) => {
    if (i > 0) {
      doc.addPage();
      y = M;
    }
    if (input.kind === "full") {
      text(`Writing Task ${task}`, 14, "bold");
      gap(2);
    }
    for (const line of promptLines(task, prompt)) {
      if (line === "") gap(2);
      else text(line, 11);
    }
    if (task === 1 && image) {
      const { w, h } = fit(image.w, image.h, width, 110);
      gap(3);
      ensure(h);
      try {
        doc.addImage(image.data, image.format, M, y, w, h);
        y += h;
      } catch {
        /* an unreadable picture must not stop the download */
      }
    }
    gap(7);
    text(`Your answer (${countWords(answer)} words)`, 12, "bold");
    gap(2);
    for (const para of (answer || "").split(/\n/)) {
      if (!para.trim()) gap(3);
      else text(para, 11);
    }
  });

  const safe = (input.studentName || "student").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  doc.save(`IELTS_Writing_${FILE[input.kind]}_practice_${safe || "student"}.pdf`);
}
