// Pure: parses what a student sends the student bot. No imports (unit-tested
// without the @/ alias, like router.ts and teacher-router.ts).

export type StudentCommand =
  | { kind: "link"; code: string }
  | { kind: "start" }
  | { kind: "test" }
  | { kind: "stop" }
  | { kind: "daily" }
  | { kind: "help" }
  /** Anything that is not a command: answered with a short nudge, not the whole welcome. */
  | { kind: "text" };

export function parseStudentText(text: string | undefined | null): StudentCommand {
  const t = (text ?? "").trim();
  const m = /^\/(\w+)(?:@\w+)?(?:\s+(\S+))?/.exec(t);
  if (!m) return { kind: "text" };
  const cmd = m[1].toLowerCase();
  const arg = m[2] ?? "";
  if (cmd === "start") {
    const link = /^link_([A-Za-z0-9]{12})$/.exec(arg);
    return link ? { kind: "link", code: link[1] } : { kind: "start" };
  }
  if (cmd === "test") return { kind: "test" };
  if (cmd === "stop") return { kind: "stop" };
  if (cmd === "daily") return { kind: "daily" };
  return { kind: "help" };
}

/** The daily message's text (HTML). Pure so its wording is tested. */
export function dailyText(o: {
  name: string | null;
  title: string;
  kind: "free" | "pass" | "open";
  passesLeft: number | null;
  monday: boolean;
  trialDaysLeft: number;
}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines: string[] = [];
  lines.push(`📚 <b>Today's test${o.name ? `, ${esc(o.name)}` : ""}</b>`);
  lines.push(esc(o.title));
  if (o.kind === "pass") lines.push("Premium test: open it free with one of your weekly passes.");
  if (o.monday && o.passesLeft != null) lines.push("🎁 Your 3 free Premium tests for this week are ready.");
  else if (o.passesLeft != null && o.passesLeft > 0) lines.push(`You have ${o.passesLeft} free Premium test${o.passesLeft === 1 ? "" : "s"} left this week.`);
  if (o.trialDaysLeft === 1) lines.push("⏳ Your free trial ends tomorrow. Keep everything from $2 on mockonline.uz/premium.");
  return lines.join("\n");
}
