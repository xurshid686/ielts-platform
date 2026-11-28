import { describe, it, expect } from "vitest";
import { CB, copy, miniAppUrl, pickLang, startTestKeyboard, welcomeKeyboard, type Lang } from "./bot-copy";

const LANGS: Lang[] = ["en", "uz"];

/** Every leaf string of the copy, with function entries called with a sample name. */
function leaves(o: unknown, path = ""): [string, string][] {
  if (typeof o === "string") return [[path, o]];
  if (typeof o === "function") return [[path, String((o as (n: string | null) => string)("Ali"))]];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
}

/** Telegram's HTML mode needs every tag closed, in order. */
function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const m of html.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
}

describe("pickLang", () => {
  it("uz and its variants get Uzbek, everything else English", () => {
    expect(pickLang("uz")).toBe("uz");
    expect(pickLang("UZ-Latn")).toBe("uz");
    expect(pickLang("ru")).toBe("en");
    expect(pickLang("en")).toBe("en");
    expect(pickLang(undefined)).toBe("en");
    expect(pickLang(null)).toBe("en");
  });
});

describe("copy", () => {
  it("both languages have the same keys and nothing empty", () => {
    const en = leaves(copy("en"));
    const uz = leaves(copy("uz"));
    expect(uz.map(([k]) => k)).toEqual(en.map(([k]) => k));
    for (const [k, v] of [...en, ...uz]) expect(v.trim(), k).not.toBe("");
  });

  it("every message is balanced HTML Telegram will accept", () => {
    for (const lang of LANGS) {
      for (const [k, v] of leaves(copy(lang))) expect(balanced(v), `${lang}${k}`).toBe(true);
      expect(copy(lang).help).toContain("<blockquote expandable>");
    }
  });

  it("escapes the user's name", () => {
    expect(copy("en").welcome("<b>")).toContain("&lt;b&gt;");
    expect(copy("uz").welcome(null)).toContain("Salom!");
  });
});

describe("keyboards", () => {
  it("callback data fits Telegram's 64 bytes", () => {
    for (const v of Object.values(CB)) expect(Buffer.byteLength(v)).toBeLessThanOrEqual(64);
  });

  it("welcome: test + help callbacks, the Mini App, premium and channel links", () => {
    for (const lang of LANGS) {
      const rows = welcomeKeyboard(lang, "https://mockonline.uz/");
      const all = rows.flat();
      expect(all.find((b) => b.callback_data === CB.test)?.style).toBe("success");
      expect(all.some((b) => b.callback_data === CB.help)).toBe(true);
      expect(all.find((b) => b.web_app)?.web_app?.url).toBe("https://mockonline.uz/tg?next=%2Fdashboard");
      expect(all.some((b) => b.url === "https://mockonline.uz/premium")).toBe(true);
      // Exactly one action per button.
      for (const b of all) expect([b.url, b.callback_data, b.web_app].filter(Boolean)).toHaveLength(1);
    }
  });

  it("start-test button opens the paper through /tg", () => {
    const [[b]] = startTestKeyboard("uz", "https://mockonline.uz", "/reading/abc");
    expect(b.web_app?.url).toBe("https://mockonline.uz/tg?next=%2Freading%2Fabc");
    expect(miniAppUrl("https://x.uz/", "/a?b=1")).toBe("https://x.uz/tg?next=%2Fa%3Fb%3D1");
  });
});
