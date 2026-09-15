import { describe, it, expect } from "vitest";
import { HARVEST_ANSWERS_JS, RESTORE_ANSWERS_JS } from "./scoring-bridge";
import { sanitizeTestHtml, findUnstrippedLiterals } from "./sanitize-test-html";

// restoreAnswers() refills a mock section after a reload (0052). No jsdom in
// this project, so — like __harvest.test.ts — the handful of selectors the
// shipped string uses are implemented on a tiny fake DOM and the real string
// is executed against it.

type Attrs = Record<string, string>;

class Input {
  attrs: Attrs;
  value: string;
  checked: boolean;
  events: string[] = [];
  constructor(attrs: Attrs) {
    this.attrs = attrs;
    this.value = attrs.value ?? "";
    this.checked = attrs.checked === "true";
  }
  get name() {
    return this.attrs.name ?? "";
  }
  get type() {
    return this.attrs.type ?? "text";
  }
  getAttribute(n: string) {
    return this.attrs[n] ?? null;
  }
  dispatchEvent(e: { type: string }) {
    this.events.push(e.type);
    return true;
  }
}

function fakeDocument(els: Input[]) {
  return {
    querySelectorAll(sel: string) {
      let m = sel.match(/^\[name="(q\d+)"\]$/);
      if (m) return els.filter((e) => e.name === m![1]);
      m = sel.match(/^input\[data-q="(\d+)"\]$/);
      if (m) return els.filter((e) => e.attrs["data-q"] === m![1]);
      if (sel === '[name^="q"]') return els.filter((e) => e.name.startsWith("q"));
      if (sel === "input[data-q]") return els.filter((e) => "data-q" in e.attrs);
      return [];
    },
  };
}

function run(els: Input[], answers: Record<string, string>) {
  const fn = new Function(
    "document",
    "Event",
    `${HARVEST_ANSWERS_JS}\n${RESTORE_ANSWERS_JS}\nreturn { missing: restoreAnswers(${JSON.stringify(answers)}), after: harvestAnswers() };`,
  );
  class FakeEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  }
  return fn(fakeDocument(els), FakeEvent) as { missing: number[]; after: Record<string, string> };
}

describe("restoreAnswers", () => {
  it("refills text, radios and listening gaps and round-trips through harvest", () => {
    const els = [
      new Input({ name: "q1", type: "text" }),
      new Input({ name: "q2", type: "radio", value: "TRUE" }),
      new Input({ name: "q2", type: "radio", value: "FALSE" }),
      new Input({ "data-q": "3", type: "text" }),
    ];
    const { missing, after } = run(els, { 1: "migration", 2: "FALSE", 3: "42" });
    expect(missing).toEqual([]);
    expect(after).toEqual({ 1: "migration", 2: "FALSE", 3: "42" });
    expect(els[2].events).toEqual(["input", "change"]);
    expect(els[1].checked).toBe(false);
  });

  it("reports what it cannot put back (drag-drop, unknown values) and ignores junk keys", () => {
    const els = [new Input({ name: "q5", type: "radio", value: "A" })];
    const { missing } = run(els, { 5: "Z", 9: "iv", __proto__x: "x" } as Record<string, string>);
    expect(missing).toEqual([5, 9]);
  });
});

describe("sanitized bridge with the control channel", () => {
  it("still passes the fail-closed key check", () => {
    const html = `<html><head></head><body><script>const correctAnswers = {1:'a'}; function showResults(){}</script></body></html>`;
    const out = sanitizeTestHtml(html, "https://mockonline.uz", "00000000-0000-0000-0000-000000000000");
    expect(findUnstrippedLiterals(out)).toEqual([]);
    expect(out).toContain("IELTS_PLATFORM");
    expect(out).toContain("function restoreAnswers");
  });
});
