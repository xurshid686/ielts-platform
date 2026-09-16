import { describe, expect, it } from "vitest";
import { buildMockReceiptEmail, buildMockResultEmail, type Brand } from "./mock-templates";

const BRAND: Brand = {
  name: "MockOnline",
  url: "https://mockonline.uz",
  contactUrl: "https://t.me/ListeningReadingTests",
};

const result = (over: Partial<Parameters<typeof buildMockResultEmail>[1]> = {}) =>
  buildMockResultEmail(BRAND, {
    name: "Aziza Karimova",
    mockTitle: "Mock 1 — September",
    overall: "7.0",
    bands: [
      { label: "Listening", band: "7.5", sub: "33/40 correct" },
      { label: "Reading", band: "7.0", sub: "31/40 correct" },
      { label: "Writing", band: "6.5", sub: "Task 1: 6.0 · Task 2: 7.0" },
    ],
    feedback: "Good range. Watch article use.",
    resultUrl: "https://mockonline.uz/mock/abc/result",
    reviewUrls: [
      { label: "Listening", url: "https://mockonline.uz/mock/abc/review/listening" },
      { label: "Reading", url: "https://mockonline.uz/mock/abc/review/reading" },
    ],
    attached: true,
    ...over,
  });

describe("result email", () => {
  it("puts the overall band and every skill in the body", () => {
    const { subject, html } = result();
    expect(subject).toBe("Your Mock 1 — September result — overall band 7.0");
    for (const bit of ["7.0", "7.5", "6.5", "33/40 correct", "Listening", "Reading", "Writing"]) {
      expect(html).toContain(bit);
    }
    expect(html).toContain("Good range. Watch article use.");
  });

  it("links to the result page and to both papers, absolutely", () => {
    const { html } = result();
    expect(html).toContain('href="https://mockonline.uz/mock/abc/result"');
    expect(html).toContain('href="https://mockonline.uz/mock/abc/review/listening"');
    expect(html).toContain('href="https://mockonline.uz/mock/abc/review/reading"');
    // A relative link has no origin to resolve against in an email client.
    expect(html).not.toMatch(/href="\/[^/]/);
  });

  it("only offers the sections that were sat", () => {
    const { html } = result({ reviewUrls: [{ label: "Reading", url: "https://mockonline.uz/mock/abc/review/reading" }] });
    expect(html).toContain("review/reading");
    expect(html).not.toContain("review/listening");
  });

  it("says the paper is attached only when it is", () => {
    expect(result().html).toMatch(/attached to this email/);
    expect(result({ attached: false }).html).not.toMatch(/attached to this email/);
  });

  it("greets by first name and escapes what a student controls", () => {
    expect(result().html).toContain("Hi Aziza,");
    const html = result({ name: '<script>alert("x")</script>', mockTitle: "Mock <b>1</b>" }).html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Mock &lt;b&gt;1&lt;/b&gt;");
  });

  it("drops the feedback block when there is none", () => {
    expect(result({ feedback: null }).html).not.toContain("Writing feedback");
  });
});

describe("receipt email", () => {
  const receipt = buildMockReceiptEmail(BRAND, {
    name: "Bek",
    mockTitle: "Mock 1",
    submittedAt: "16 Sept 2026, 09:40",
  });

  it("confirms it arrived", () => {
    expect(receipt.subject).toBe("We've received your Mock 1");
    expect(receipt.html).toContain("16 Sept 2026, 09:40");
    expect(receipt.html).toMatch(/not ready yet/i);
  });

  it("carries no score at all", () => {
    expect(receipt.html).not.toMatch(/\bband\s*[0-9]/i);
    expect(receipt.html).not.toMatch(/\d+\s*\/\s*40/);
  });
});
