import { describe, it, expect } from "vitest";
import { HARVEST_ANSWERS_JS } from "./scoring-bridge";

// harvestAnswers() decides what the SERVER gets to grade. When it misses a
// question type the student sees a correct answer on screen and a lower score
// in their history — which is exactly what happened: three generations of
// reading drag-and-drop (heading / dd / ending tokens) were never harvested, so
// 58 of 151 live tests saved a score with those questions counted wrong.
//
// There is no DOM in this suite (no jsdom in the project), so the few selectors
// the function actually uses are implemented here directly. That keeps this a
// real behavioural test of the shipped string rather than a grep over it.

type Attrs = Record<string, string>;

class El {
  attrs: Attrs;
  children: El[];
  constructor(attrs: Attrs, children: El[] = []) {
    this.attrs = attrs;
    this.children = children;
  }
  getAttribute(n: string) {
    return this.attrs[n] ?? null;
  }
  get dataset() {
    const d: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.attrs)) {
      if (k.startsWith("data-")) d[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    }
    return d;
  }
  get name() { return this.attrs.name ?? ""; }
  get type() { return this.attrs.type ?? ""; }
  get value() { return this.attrs.value ?? ""; }
  get checked() { return this.attrs.checked === "true"; }

  matches(sel: string): boolean {
    return sel.split(",").some((oneRaw) => {
      const one = oneRaw.trim();
      if (one === '[name^="q"]') return (this.attrs.name ?? "").startsWith("q");
      if (one === "input[data-q]") return this.attrs.tag === "input" && "data-q" in this.attrs;
      if (one === ".dropzone[data-q]") return this.cls().includes("dropzone") && "data-q" in this.attrs;
      if (one === ".mcq.multi[data-qs]")
        return this.cls().includes("mcq") && this.cls().includes("multi") && "data-qs" in this.attrs;
      if (one === "[data-q]") return "data-q" in this.attrs;
      if (one === '[class*="token"]') return (this.attrs.class ?? "").includes("token");
      if (one === '[type="checkbox"]' || one === 'input[type="checkbox"]')
        return this.attrs.type === "checkbox";
      const m = one.match(/^\[([\w-]+)\]$/);
      if (m) return m[1] in this.attrs;
      return false;
    });
  }
  cls() { return (this.attrs.class ?? "").split(/\s+/); }
  descendants(): El[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  querySelectorAll(sel: string): El[] {
    return this.descendants().filter((e) => e.matches(sel));
  }
  querySelector(sel: string): El | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

function harvestFrom(root: El): Record<string, string> {
  const document = {
    querySelectorAll: (sel: string) => root.querySelectorAll(sel),
  };
  const fn = new Function("document", `${HARVEST_ANSWERS_JS}; return harvestAnswers();`);
  return fn(document);
}

const input = (a: Attrs) => new El({ tag: "input", ...a });

describe("harvestAnswers", () => {
  it("reads radios, text inputs and listening gaps", () => {
    const out = harvestFrom(
      new El({}, [
        input({ name: "q1", type: "radio", value: "TRUE", checked: "true" }),
        input({ name: "q1", type: "radio", value: "FALSE" }),
        input({ name: "q2", type: "text", value: "  granite  " }),
        input({ class: "gap", "data-q": "3", value: "21.50" }),
      ]),
    );
    expect(out).toEqual({ "1": "TRUE", "2": "granite", "3": "21.50" });
  });

  it("reads the listening dropzone, whose answer sits on the ZONE", () => {
    const out = harvestFrom(
      new El({}, [new El({ class: "dropzone", "data-q": "12", "data-value": "B" })]),
    );
    expect(out).toEqual({ "12": "B" });
  });

  // The regression this file exists for.
  it.each([
    ["matching headings", "heading-drop", "heading-token", "data-heading", "iv"],
    ["drag-token summary", "dd-drop", "dd-token", "data-letter", "C"],
    ["sentence endings", "ending-drop", "ending-token", "data-ending", "G"],
  ])("reads reading drag answers off the TOKEN — %s", (_label, zone, token, attr, want) => {
    const out = harvestFrom(
      new El({}, [
        new El({ class: zone, "data-q": "7" }, [new El({ class: token, [attr]: want })]),
        new El({ class: zone, "data-q": "8" }), // nothing dropped yet
      ]),
    );
    expect(out).toEqual({ "7": want });
  });

  it("reads an unknown token generation via its single data-* attribute", () => {
    const out = harvestFrom(
      new El({}, [
        new El({ class: "future-drop", "data-q": "5" }, [
          new El({ class: "future-token", "data-whatever": "xi" }),
        ]),
      ]),
    );
    expect(out).toEqual({ "5": "xi" });
  });

  it("reads a token that carries data-q itself rather than on a wrapper", () => {
    const out = harvestFrom(
      new El({}, [new El({ class: "heading-token", "data-q": "6", "data-heading": "ii" })]),
    );
    expect(out).toEqual({ "6": "ii" });
  });

  it("never submits bookkeeping attributes as an answer", () => {
    const out = harvestFrom(
      new El({}, [
        new El({ class: "future-drop", "data-q": "9" }, [
          new El({ class: "future-token", "data-index": "0" }),
        ]),
      ]),
    );
    expect(out).toEqual({});
  });

  it("still finds the answer when a token also carries bookkeeping attributes", () => {
    const out = harvestFrom(
      new El({}, [
        new El({ class: "future-drop", "data-q": "10" }, [
          new El({ class: "future-token", "data-index": "3", "data-choice": "vii" }),
        ]),
      ]),
    );
    expect(out).toEqual({ "10": "vii" });
  });

  it("never lets a drop zone overwrite an input-based answer", () => {
    const out = harvestFrom(
      new El({}, [
        input({ name: "q4", type: "radio", value: "YES", checked: "true" }),
        new El({ class: "heading-drop", "data-q": "4" }, [
          new El({ class: "heading-token", "data-heading": "stale" }),
        ]),
      ]),
    );
    expect(out).toEqual({ "4": "YES" });
  });

  it("assigns a 'choose TWO letters' group's sorted picks to its slots", () => {
    const out = harvestFrom(
      new El({}, [
        new El({ class: "mcq multi", "data-qs": "21,22" }, [
          input({ type: "checkbox", value: "D", checked: "true" }),
          input({ type: "checkbox", value: "B", checked: "true" }),
          input({ type: "checkbox", value: "A" }),
        ]),
      ]),
    );
    expect(out).toEqual({ "21": "B", "22": "D" });
  });

  it("omits blank answers rather than sending empty strings", () => {
    const out = harvestFrom(
      new El({}, [
        input({ name: "q1", type: "text", value: "   " }),
        input({ name: "q2", type: "radio", value: "TRUE" }),
      ]),
    );
    expect(out).toEqual({});
  });
});
