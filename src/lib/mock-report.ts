import "server-only";

import type { AttemptDetail, ReviewLine } from "@/lib/mock";
import { promptLines } from "@/lib/ielts/writing-prompt";
import { countWords, tashkent } from "@/lib/mock-shared";

// The saveable mock result (owner, 2026-09-16): one report, two formats.
//
// Built on the SERVER so the student's own download, the owner's download of any
// attempt and the whole-mock export are the same document, and so the Task 1
// picture can be embedded from the private bucket without a signed URL in the
// browser. Nothing here decides who may read what — the route does that.

export type ReportImage = { data: Buffer; format: "PNG" | "JPEG"; w: number; h: number };

export type MockReportData = {
  mockTitle: string;
  student: string;
  email: string | null;
  submitted: string;
  released: string;
  bands: { label: string; band: string; sub: string }[];
  overall: string;
  feedback: string | null;
  tasks: { n: 1 | 2; lines: string[]; words: number; essay: string }[];
  tables: { heading: string; lines: ReviewLine[] }[];
  image: ReportImage | null;
  autoSubmitted: boolean;
};

const fmt = (b: number | null | undefined) => (b == null ? "—" : Number(b).toFixed(1));

/** The report for one attempt. `image` is fetched by the caller (route) if wanted. */
export function reportData(detail: AttemptDetail, image: ReportImage | null): MockReportData {
  const a = detail.attempt;
  const counters = (a.integrity as { counters?: { writing_auto_submitted?: number } } | null)?.counters;
  return {
    mockTitle: detail.mock?.title ?? "Mock exam",
    student: a.student_name?.trim() || a.student_email || "Student",
    email: a.student_email,
    submitted: tashkent(a.submitted_at),
    released: tashkent(a.released_at),
    overall: fmt(a.overall_band),
    bands: [
      {
        label: "Listening",
        band: fmt(a.listening_band),
        sub: a.listening_raw != null ? `${a.listening_raw}/${a.listening_total ?? "?"} correct` : "not submitted",
      },
      {
        label: "Reading",
        band: fmt(a.reading_band),
        sub: a.reading_raw != null ? `${a.reading_raw}/${a.reading_total ?? "?"} correct` : "not submitted",
      },
      {
        label: "Writing",
        band: fmt(a.writing_band),
        sub: `Task 1: ${fmt(a.writing_task1_band)} · Task 2: ${fmt(a.writing_task2_band)}`,
      },
    ],
    feedback: a.writing_feedback?.trim() || null,
    tasks: [1, 2].map((n) => ({
      n: n as 1 | 2,
      lines: promptLines(n as 1 | 2, n === 1 ? a.writing_task1_prompt : a.writing_task2_prompt),
      words: countWords(n === 1 ? a.writing_task1 : a.writing_task2),
      essay: (n === 1 ? a.writing_task1 : a.writing_task2) ?? "",
    })),
    tables: [
      { heading: `Listening — ${detail.listeningTitle ?? "not submitted"}`, lines: detail.listeningReview },
      { heading: `Reading — ${detail.readingTitle ?? "not submitted"}`, lines: detail.readingReview },
    ],
    image,
    autoSubmitted: (counters?.writing_auto_submitted ?? 0) > 0,
  };
}

/** PNG/JPEG size straight from the bytes — no image library, and nothing is re-encoded. */
export function imageMeta(data: Buffer): ReportImage | null {
  if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50) {
    return { data, format: "PNG", w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = data[i + 1];
      const len = data.readUInt16BE(i + 2);
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry the dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { data, format: "JPEG", h: data.readUInt16BE(i + 5), w: data.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

const answerRows = (lines: ReviewLine[]) =>
  lines.map((l) => [l.q, l.given || "(blank)", l.accepted.join(" / "), l.correct ? "correct" : "wrong"]);

// ------------------------------------------------------------------------ PDF

export async function renderReportPdf(reports: MockReportData[]): Promise<Uint8Array> {
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
  const text = (s: string, size = 11, style: "normal" | "bold" = "normal", indent = 0) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lh = size * 0.45;
    for (const line of doc.splitTextToSize(s, width - indent) as string[]) {
      ensure(lh);
      doc.text(line, M + indent, y);
      y += lh;
    }
  };
  const gap = (h = 3) => {
    y += h;
  };

  reports.forEach((r, i) => {
    if (i > 0) {
      doc.addPage();
      y = M;
    }
    text(r.mockTitle, 16, "bold");
    gap(1);
    text(`IELTS mock result · ${r.student}${r.email ? ` · ${r.email}` : ""}`, 10);
    text(`Submitted ${r.submitted} · Released ${r.released}`, 10);
    gap(4);

    text(`Overall band ${r.overall}`, 14, "bold");
    gap(2);
    for (const b of r.bands) text(`${b.label}: ${b.band}   (${b.sub})`, 11);
    if (r.autoSubmitted) {
      gap(2);
      text("Writing was submitted automatically after 3 exam-rule violations.", 10, "bold");
    }

    if (r.feedback) {
      gap(5);
      text("Writing feedback", 13, "bold");
      gap(1);
      for (const para of r.feedback.split(/\n/)) {
        if (para.trim()) text(para, 11);
        else gap(2);
      }
    }

    for (const t of r.tasks) {
      gap(6);
      text(`Writing Task ${t.n}`, 13, "bold");
      gap(1);
      for (const line of t.lines) {
        if (line === "") gap(2);
        else text(line, 11);
      }
      if (t.n === 1 && r.image) {
        const k = Math.min(width / r.image.w, 105 / r.image.h);
        const w = r.image.w * k;
        const h = r.image.h * k;
        gap(3);
        ensure(h);
        try {
          doc.addImage(
            `data:image/${r.image.format === "PNG" ? "png" : "jpeg"};base64,${r.image.data.toString("base64")}`,
            r.image.format,
            M,
            y,
            w,
            h,
            undefined,
            // Deflated: a raw screenshot PNG made a 3.5 MB report.
            "FAST",
          );
          y += h;
        } catch {
          /* an unreadable picture must not stop the report */
        }
      }
      gap(4);
      text(`Answer (${t.words} words)`, 12, "bold");
      gap(1);
      for (const para of (t.essay || "(nothing written)").split(/\n/)) {
        if (para.trim()) text(para, 11);
        else gap(2);
      }
    }

    for (const table of r.tables) {
      if (!table.lines.length) continue;
      gap(6);
      text(table.heading, 13, "bold");
      gap(2);
      const cols = [M, M + 14, M + 64, M + 124];
      const header = ["Q", "Your answer", "Accepted", ""];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ensure(6);
      header.forEach((h, c) => doc.text(h, cols[c], y));
      y += 5;
      doc.setFont("helvetica", "normal");
      for (const row of answerRows(table.lines)) {
        ensure(5);
        row.forEach((cell, c) => {
          const max = c === 0 ? 12 : c === 3 ? 30 : 55;
          doc.text((doc.splitTextToSize(cell, max) as string[])[0] ?? "", cols[c], y);
        });
        y += 4.6;
      }
    }
  });

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

// ----------------------------------------------------------------------- Word

export async function renderReportDocx(reports: MockReportData[]): Promise<Buffer> {
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } =
    await import("docx");

  const para = (t: string, opts: { bold?: boolean; size?: number } = {}) =>
    new Paragraph({ children: [new TextRun({ text: t, bold: opts.bold, size: opts.size ?? 22 })] });

  type Block = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  const children: Block[] = [];
  reports.forEach((r, i) => {
    if (i > 0) children.push(new Paragraph({ text: "", pageBreakBefore: true }));
    children.push(new Paragraph({ text: r.mockTitle, heading: HeadingLevel.HEADING_1 }));
    children.push(para(`IELTS mock result · ${r.student}${r.email ? ` · ${r.email}` : ""}`, { size: 20 }));
    children.push(para(`Submitted ${r.submitted} · Released ${r.released}`, { size: 20 }));
    children.push(new Paragraph({ text: `Overall band ${r.overall}`, heading: HeadingLevel.HEADING_2 }));
    for (const b of r.bands) children.push(para(`${b.label}: ${b.band}   (${b.sub})`));
    if (r.autoSubmitted) children.push(para("Writing was submitted automatically after 3 exam-rule violations.", { bold: true }));

    if (r.feedback) {
      children.push(new Paragraph({ text: "Writing feedback", heading: HeadingLevel.HEADING_2 }));
      for (const line of r.feedback.split(/\n/)) children.push(para(line));
    }

    for (const t of r.tasks) {
      children.push(new Paragraph({ text: `Writing Task ${t.n}`, heading: HeadingLevel.HEADING_2 }));
      for (const line of t.lines) children.push(para(line));
      if (t.n === 1 && r.image) {
        const k = Math.min(1, 560 / r.image.w);
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: r.image.data,
                type: r.image.format === "PNG" ? "png" : "jpg",
                transformation: { width: Math.round(r.image.w * k), height: Math.round(r.image.h * k) },
              }),
            ],
          }),
        );
      }
      children.push(para(`Answer (${t.words} words)`, { bold: true }));
      for (const line of (t.essay || "(nothing written)").split(/\n/)) children.push(para(line));
    }

    for (const table of r.tables) {
      if (!table.lines.length) continue;
      children.push(new Paragraph({ text: table.heading, heading: HeadingLevel.HEADING_2 }));
      const cell = (t: string, bold = false) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold, size: 20 })] })] });
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ["Q", "Your answer", "Accepted", ""].map((h) => cell(h, true)) }),
            ...answerRows(table.lines).map((row) => new TableRow({ children: row.map((c) => cell(c)) })),
          ],
        }),
      );
    }
  });

  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

/** A filename that survives Windows, macOS and the Content-Disposition header. */
export function reportFilename(parts: string[], ext: "pdf" | "docx"): string {
  const base = parts
    .map((p) => p.replace(/[^\p{L}\p{N} _-]+/gu, "").trim())
    .filter(Boolean)
    .join(" - ")
    .slice(0, 120);
  return `${base || "Mock result"}.${ext}`;
}
