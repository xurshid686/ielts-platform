import "server-only";

import type { AiTaskResult } from "@/lib/writing-ai-shared";
import type { ReportImage } from "@/lib/mock-report";
import { LOGO_PNG_BASE64 } from "@/lib/brand-logo";
import { SITE_HOST, SITE_NAME, SITE_URL } from "@/lib/site";

// The PDF of one AI check, in two variants (both carry the logo + website address):
//  - "owner": who the student is (credentials), what they wrote, everything Axiom
//    said. Posted to the owner's Telegram group (writing-ai-telegram.ts); never
//    offered to a student. Mock drafts are marked DRAFT.
//  - "student": the same report without the internal credentials, labelled "AI
//    estimate". Emailed to a Premium student after a PRACTICE check
//    (writing-ai-email.ts). It never mentions the owner copy.
// Nothing here is stored.

export type AiReportVariant = "owner" | "student";

export type AiReportTask = {
  n: 1 | 2;
  /** The question as the student saw it, line by line. */
  lines: string[];
  words: number;
  essay: string;
  image: ReportImage | null;
  result: AiTaskResult | null;
};

export type AiReportData = {
  title: string;
  /** Mock drafts say so on the first page, so nobody mistakes one for a released result. */
  draftNote: string | null;
  /** The student's "credentials": name, email, id, Premium, source, times, quota… */
  credentials: { label: string; value: string }[];
  tasks: AiReportTask[];
};

/** jsPDF's built-in Helvetica is Latin-1 only: flatten the typographic characters essays are full of. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/[    ]/g, " ")
    .replace(/[​-‏⁠﻿]/g, "")
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/g, "?");
}

const fmt = (b: number | null | undefined) => (b == null ? "-" : b.toFixed(1));

export async function renderAiCheckPdf(data: AiReportData, opts: { variant?: AiReportVariant } = {}): Promise<Uint8Array> {
  const student = opts.variant === "student";
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const width = W - 2 * M;
  let y = M;

  const FOOT = 10; // room kept for the footer line
  const ensure = (h: number) => {
    if (y + h > H - M - FOOT) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, size = 11, style: "normal" | "bold" | "italic" = "normal", indent = 0) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lh = size * 0.45;
    for (const line of doc.splitTextToSize(pdfSafe(s), width - indent) as string[]) {
      ensure(lh);
      doc.text(line, M + indent, y);
      y += lh;
    }
  };
  const gap = (h = 3) => {
    y += h;
  };
  const paragraphs = (s: string, size = 11, indent = 0) => {
    for (const para of s.split(/\n/)) {
      if (para.trim()) text(para, size, "normal", indent);
      else gap(2);
    }
  };

  // Brand header: logo + name + website address.
  try {
    doc.addImage(`data:image/png;base64,${LOGO_PNG_BASE64}`, "PNG", M, y, 15, 15, undefined, "FAST");
  } catch {
    /* a missing logo must not stop the report */
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(pdfSafe(SITE_NAME), M + 19, y + 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(192, 87, 46);
  doc.textWithLink(SITE_HOST, M + 19, y + 12, { url: SITE_URL });
  doc.setTextColor(0, 0, 0);
  y += 22;

  text(data.title, 16, "bold");
  if (student) {
    gap(1);
    text("An AI estimate to guide your practice, not an official IELTS result.", 9.5, "italic");
  }
  if (data.draftNote) {
    gap(1);
    text(data.draftNote, 10, "bold");
  }
  gap(3);

  // Credentials block.
  doc.setFont("helvetica", "bold");
  for (const c of data.credentials) {
    doc.setFontSize(10);
    ensure(5);
    doc.setFont("helvetica", "bold");
    doc.text(pdfSafe(`${c.label}:`), M, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(pdfSafe(c.value || "-"), width - 42) as string[];
    lines.forEach((line, i) => {
      if (i > 0) ensure(4.6);
      doc.text(line, M + 42, y);
      if (i < lines.length - 1) y += 4.6;
    });
    y += 5;
  }

  // Summary of Axiom's overall bands.
  const overall = data.tasks.filter((t) => t.result);
  if (overall.length) {
    gap(3);
    text(
      `${student ? "AI estimate" : "Axiom bands"}: ${overall.map((t) => `Task ${t.n} overall ${fmt(t.result?.overall)}`).join("   |   ")}`,
      12,
      "bold",
    );
  }

  for (const t of data.tasks) {
    gap(7);
    text(`Writing Task ${t.n}`, 14, "bold");
    gap(1);
    for (const line of t.lines) {
      if (line === "") gap(2);
      else text(line, 11);
    }
    if (t.n === 1 && t.image) {
      const k = Math.min(width / t.image.w, 100 / t.image.h);
      const w = t.image.w * k;
      const h = t.image.h * k;
      gap(3);
      ensure(h);
      try {
        doc.addImage(
          `data:image/${t.image.format === "PNG" ? "png" : "jpeg"};base64,${t.image.data.toString("base64")}`,
          t.image.format,
          M,
          y,
          w,
          h,
          undefined,
          "FAST",
        );
        y += h;
      } catch {
        /* an unreadable picture must not stop the report */
      }
    }
    gap(4);
    text(`${student ? "Your answer" : "Student's answer"} (${t.words} words)`, 12, "bold");
    gap(1);
    paragraphs(t.essay || "(nothing written)");

    if (!t.result) {
      gap(4);
      text(`${student ? "The AI" : "Axiom"} did not check this task.`, 11, "italic");
      continue;
    }
    gap(5);
    text(`${student ? "AI assessment" : "Axiom's assessment"} - overall ${fmt(t.result.overall)}`, 12, "bold");
    for (const c of t.result.criteria) {
      gap(3);
      text(`${c.label}: ${fmt(c.band)}`, 11, "bold");
      if (c.description) text(c.description, 10, "normal", 3);
      for (const s of c.suggestions) text(`- ${s}`, 10, "normal", 3);
      for (const r of c.revisions) {
        gap(1);
        text(`Original: ${r.original}`, 9.5, "italic", 3);
        text(`Better:   ${r.revised}`, 9.5, "normal", 3);
      }
    }
  }

  // Footer on every page: website address + page numbers.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 224, 232);
    doc.line(M, H - M - 2, W - M, H - M - 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(192, 87, 46);
    doc.textWithLink(SITE_HOST, M, H - M + 3, { url: SITE_URL });
    doc.setTextColor(110, 118, 135);
    doc.text(`Page ${i} of ${pages}`, W - M, H - M + 3, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
