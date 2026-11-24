import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./content-disposition";

describe("attachmentDisposition", () => {
  it("keeps an ASCII name as is", () => {
    expect(attachmentDisposition("Ali Valiyev - Mock 3.pdf")).toBe(
      "attachment; filename=\"Ali Valiyev - Mock 3.pdf\"; filename*=UTF-8''Ali%20Valiyev%20-%20Mock%203.pdf",
    );
  });

  it("produces a header value Headers accepts for a Cyrillic name", () => {
    const value = attachmentDisposition("Мадина Каримова - Mock 3.pdf");
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
    expect(value).toContain('filename="- Mock 3.pdf"');
    expect(value).toContain("filename*=UTF-8''" + encodeURIComponent("Мадина Каримова - Mock 3.pdf"));
  });

  it("falls back when nothing ASCII is left", () => {
    expect(attachmentDisposition("Отчёт")).toMatch(/^attachment; filename="download"; /);
  });

  it("cannot break out of the quoted value", () => {
    const value = attachmentDisposition('a"; evil=1.pdf');
    expect(value.startsWith('attachment; filename="a; evil=1.pdf";')).toBe(true);
  });
});
