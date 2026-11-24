// "Report a problem" (0072): the rules shared by the dialog and the server
// action. Imports NOTHING, so it is unit-testable and safe in a client bundle.

export const REPORT_CATEGORIES = [
  { id: "wrong_answer", label: "Wrong answer key" },
  { id: "text_error", label: "Mistake in the text" },
  { id: "layout", label: "Page looks broken" },
  { id: "audio", label: "Audio problem" },
  { id: "other", label: "Something else" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["id"];
export type ReportStatus = "open" | "fixed" | "dismissed";

export const REPORT_MESSAGE_MIN = 5;
export const REPORT_MESSAGE_MAX = 1000;
export const REPORTS_PER_DAY = 5;
export const REPORT_SAME_TEST_MINUTES = 10;
export const REPORT_FIXED_XP = 50;

export function categoryLabel(id: string): string {
  return REPORT_CATEGORIES.find((c) => c.id === id)?.label ?? "Something else";
}

/** Categories offered for a skill: "Audio problem" is listening-only. */
export function categoriesFor(skill: string) {
  return REPORT_CATEGORIES.filter((c) => c.id !== "audio" || skill === "listening");
}

export type ReportInput = { category: string; question?: string | null; message: string };
export type CleanReport = { category: ReportCategory; question: string | null; message: string };

/** Validate + normalise what the student typed. Same rules as 0072's CHECKs. */
export function cleanReport(input: ReportInput): { ok: true; value: CleanReport } | { ok: false; error: string } {
  const category = REPORT_CATEGORIES.find((c) => c.id === input.category)?.id;
  if (!category) return { ok: false, error: "Choose what kind of problem it is." };

  const q = (input.question ?? "").replace(/\s+/g, "").replace(/[–—]/g, "-");
  let question: string | null = null;
  if (q) {
    // "14", "14-17", "14,15" — numbers 1-40 with - or , between them.
    if (!/^\d{1,2}([-,]\d{1,2})*$/.test(q) || q.length > 20) {
      return { ok: false, error: "Question number should look like 14 or 14-17." };
    }
    const nums = q.split(/[-,]/).map(Number);
    if (nums.some((n) => n < 1 || n > 40)) {
      return { ok: false, error: "Question numbers go from 1 to 40." };
    }
    question = q;
  }

  const message = (input.message ?? "").replace(/\r\n/g, "\n").trim();
  if ([...message].length < REPORT_MESSAGE_MIN) {
    return { ok: false, error: "Please describe the problem in a few words." };
  }
  if ([...message].length > REPORT_MESSAGE_MAX) {
    return { ok: false, error: `Please keep it under ${REPORT_MESSAGE_MAX} characters.` };
  }
  return { ok: true, value: { category, question, message } };
}

/** Is the student over the limit? Counts come from the table. */
export function rateLimitError(todayCount: number, recentSameTest: number): string | null {
  if (todayCount >= REPORTS_PER_DAY) {
    return `You've sent ${REPORTS_PER_DAY} reports today. Thank you! You can send more tomorrow.`;
  }
  if (recentSameTest > 0) {
    return "You've just reported this test. We'll look at it. Please wait a few minutes to send another.";
  }
  return null;
}
