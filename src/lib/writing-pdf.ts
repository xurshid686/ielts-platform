"use client";

import { promptLines } from "@/lib/ielts/writing-prompt";
import { countWords } from "@/lib/mock-shared";

/**
 * The student's copy of their mock Writing (v3): both prompts, the Task 1
 * picture, both answers and word counts. Never a band, a violation or anything
 * the teacher decides. Built in the browser from what was just handed in.
 */
export async function downloadWritingPdf(input: {
  mockTitle: string;
  studentName: string;
  task1Prompt: string;
  task2Prompt: string;
  task1ImageUrl: string | null;
  task1: string;
  task2: string;
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

  text(input.mockTitle || "Mock exam", 16, "bold");
  gap(1);
  text(`IELTS Writing · ${input.studentName || "Student"} · ${new Date().toLocaleString()}`, 10);
  gap(4);

  const image = input.task1ImageUrl ? await toDataUrl(input.task1ImageUrl) : null;

  for (const task of [1, 2] as const) {
    if (task === 2) {
      doc.addPage();
      y = M;
    }
    text(`Writing Task ${task}`, 14, "bold");
    gap(2);
    for (const line of promptLines(task, task === 1 ? input.task1Prompt : input.task2Prompt)) {
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
    const answer = task === 1 ? input.task1 : input.task2;
    gap(6);
    text(`Your answer (${countWords(answer)} words)`, 12, "bold");
    gap(2);
    for (const para of (answer || "").split(/\n/)) {
      if (!para.trim()) gap(3);
      else text(para, 11);
    }
  }

  const safe = (input.studentName || "student").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  doc.save(`IELTS_Writing_${safe || "student"}.pdf`);
}

function fit(w: number, h: number, maxW: number, maxH: number) {
  const k = Math.min(maxW / w, maxH / h, 1e9);
  return { w: w * k, h: h * k };
}

async function toDataUrl(url: string): Promise<{ data: string; format: "JPEG"; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const src = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });
      // Re-encoded as a JPEG on white, at most 1600 px wide: a raw PNG screenshot
      // made a 3.5 MB PDF. jsPDF also reads no webp/gif, so this covers those.
      const k = Math.min(1, 1600 / img.naturalWidth);
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return { data: c.toDataURL("image/jpeg", 0.85), format: "JPEG", w, h };
    } finally {
      URL.revokeObjectURL(src);
    }
  } catch {
    return null;
  }
}
