import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { ProgressGrid } from "@/lib/discipline";
import {
  cellLines,
  dateText,
  filterSummary,
  flagSuffix,
  studentLabel,
  type ReportFilters,
} from "@/lib/discipline-report-text";

// The Discipline progress grid, as a Word document.
//
// WHY THIS EXISTS: the owner screenshots the Progress tab and shares it with a
// students' group. A screenshot cannot be filed, compared week to week, or sent
// to a parent, so this produces the same table as a real .docx.
//
// THE ONE RULE: **no email address ever reaches this document.** The report is a
// file that gets forwarded, so the safe behaviour is the only behaviour — there
// is no flag to turn it off, and `GridRow.email` is deliberately never read
// below. The on-screen "Hide emails" toggle is a separate, cosmetic thing; this
// does not consult it.

const HEAD_FILL = "F1F5F9";

function textCell(lines: string[], opts: { bold?: boolean; center?: boolean } = {}) {
  return new TableCell({
    shading: opts.bold ? { fill: HEAD_FILL } : undefined,
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: line, bold: opts.bold, size: 18 })],
        }),
    ),
  });
}

/**
 * @param grid   the whole grid, re-derived server-side
 * @param userIds which rows to include, in the order the screen showed them
 */
export async function buildProgressReport(
  grid: ProgressGrid,
  userIds: string[],
  filters: ReportFilters,
  now = new Date(),
): Promise<Buffer> {
  // Index once, then walk `userIds` — that keeps the document in the same order
  // as the screen the owner was looking at, rather than the grid's own order.
  const byId = new Map(grid.rows.map((r) => [r.userId, r]));
  const rows = userIds.map((id) => byId.get(id)).filter((r) => r !== undefined);

  const header = new TableRow({
    tableHeader: true, // repeats the header if the table breaks across pages
    children: [
      textCell(["Student"], { bold: true }),
      textCell(["Day"], { bold: true, center: true }),
      textCell(["Strikes"], { bold: true, center: true }),
      textCell(["Last seen"], { bold: true, center: true }),
      ...grid.days.map((d) => textCell([`D${d.day_number}`], { bold: true, center: true })),
    ],
  });

  const body = rows.map(
    (r) =>
      new TableRow({
        children: [
          textCell([`${studentLabel(r.name)}${flagSuffix(r)}`]),
          textCell([`${r.currentDay} of ${r.totalDays}`], { center: true }),
          textCell([String(r.strikes)], { center: true }),
          textCell([dateText(r.lastActivity)], { center: true }),
          ...grid.days.map((d) => textCell(cellLines(r.cells[d.id] ?? []), { center: true })),
        ],
      }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            // Landscape: the table is four fixed columns plus one per day, and
            // portrait stops fitting at about six days.
            size: { orientation: PageOrientation.LANDSCAPE },
          },
        },
        children: [
          new Paragraph({ text: "Discipline — progress", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({
                text:
                  `${dateText(now.toISOString())} · ${rows.length} of ${grid.rows.length} students` +
                  ` · group median Day ${grid.medianDay}`,
                size: 18,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: filterSummary(filters), size: 18, color: "666666" })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "D5DBE3" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "D5DBE3" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "D5DBE3" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "D5DBE3" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E5E9EF" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E5E9EF" },
            },
            rows: [header, ...body],
          }),
          new Paragraph({
            spacing: { before: 240 },
            children: [
              new TextRun({
                // The same legend the screen carries, so the file can be read by
                // someone who has never seen the admin page.
                text:
                  "Scores are each student's first attempt — the one the rating ladder counts. " +
                  "A dot means the paper has not been done; an em dash means the day has no papers. " +
                  "Inactive = nothing submitted in 3 days. Trailing = behind the group median.",
                size: 16,
                color: "666666",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
