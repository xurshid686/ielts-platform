import { describe, expect, it } from "vitest";
import { cleanPersonName, cleanNamePart, splitName, isWebp, sniffPhotoType } from "./profile-name";

describe("cleanPersonName", () => {
  it("joins first + surname", () => {
    expect(cleanPersonName("Xurshid", "Aliqulov")).toEqual({ ok: true, name: "Xurshid Aliqulov" });
  });
  it("keeps Uzbek apostrophes", () => {
    expect(cleanPersonName("Oʻktam", "Gʻulomov")).toEqual({ ok: true, name: "Oʻktam Gʻulomov" });
    expect(cleanPersonName("Ma'ruf", "To'xtayev")).toEqual({ ok: true, name: "Ma'ruf To'xtayev" });
  });
  it("accepts Cyrillic", () => {
    expect(cleanPersonName("Шахзод", "Каримов")).toEqual({ ok: true, name: "Шахзод Каримов" });
  });
  it("title-cases all-lower and all-upper input only", () => {
    expect(cleanPersonName("ali", "VALIYEV")).toEqual({ ok: true, name: "Ali Valiyev" });
    expect(cleanPersonName("McKenzie", "de Souza")).toEqual({ ok: true, name: "McKenzie de Souza" });
    expect(cleanPersonName("anna-maria", "smith")).toEqual({ ok: true, name: "Anna-Maria Smith" });
  });
  it("collapses whitespace", () => {
    expect(cleanPersonName("  Ali ", " Valiyev   Jr ")).toEqual({ ok: true, name: "Ali Valiyev Jr" });
  });
  it("refuses digits, symbols, too short, too long", () => {
    expect(cleanPersonName("Ali1", "Valiyev").ok).toBe(false);
    expect(cleanPersonName("Ali", "V@liyev").ok).toBe(false);
    expect(cleanPersonName("A", "Valiyev").ok).toBe(false);
    expect(cleanPersonName("Ali", "").ok).toBe(false);
    expect(cleanNamePart("x".repeat(31), "Surname").ok).toBe(false);
    expect(cleanNamePart("-Ali", "First name").ok).toBe(false);
  });
});

describe("splitName", () => {
  it("splits on the first space", () => {
    expect(splitName("Ali Valiyev Jr")).toEqual({ first: "Ali", last: "Valiyev Jr" });
    expect(splitName("Ali")).toEqual({ first: "Ali", last: "" });
    expect(splitName(null)).toEqual({ first: "", last: "" });
  });
});

describe("isWebp", () => {
  it("checks the RIFF/WEBP magic", () => {
    const ok = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]);
    expect(isWebp(ok)).toBe(true);
    expect(isWebp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});

describe("sniffPhotoType", () => {
  it("accepts WebP and JPEG only", () => {
    expect(sniffPhotoType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]))).toBe("image/webp");
    expect(sniffPhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffPhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(null);
    expect(sniffPhotoType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBe(null);
  });
});
