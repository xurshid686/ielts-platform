"use client";

import { promptLines } from "@/lib/ielts/writing-prompt";
import { topicOf } from "@/lib/writing-practice-topics";

/**
 * The student's copy of a Task 2 practice: the question in full Cambridge
 * wording, their essay, the word count, the date. Built in the browser from the
 * SUBMITTED attempt, so the copy downloaded straight after handing in and the
 * one downloaded from history months later are the same document.
 *
 * NEVER a band. Practice is not marked — there is nothing to put there, and the
 * mock's renderer (lib/writing-pdf.ts) carries the same rule for the same
 * reason. That one is left alone deliberately: it is two tasks and a picture,
 * it is live, and generalising it to serve this buys nothing.
 */
export async function downloadPracticePdf(input: {
  studentName: string;
  topic: string;
  prompt: string;
  answer: string;
  words: number;
  submittedAt: string | null;
}) {
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

  text("IELTS Writing Task 2 — practice", 16, "bold");
  gap(1);
  text(`${topicOf(input.topic).label} · ${input.studentName || "Student"} · ${when.toLocaleString()}`, 10);
  gap(5);

  for (const line of promptLines(2, input.prompt)) {
    if (line === "") gap(2);
    else text(line, 11);
  }

  gap(7);
  text(`Your answer (${input.words} words)`, 12, "bold");
  gap(2);
  for (const para of (input.answer || "").split(/\n/)) {
    if (!para.trim()) gap(3);
    else text(para, 11);
  }

  const safe = (input.studentName || "student").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  doc.save(`IELTS_Writing_Task2_practice_${safe || "student"}.pdf`);
}
