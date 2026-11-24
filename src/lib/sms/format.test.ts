import { describe, expect, it } from "vitest";
import {
  buildResultSms,
  formatUzPhone,
  isGsm7,
  isSingleGsmSegment,
  localUzDigits,
  normalizeUzPhone,
  spaceUzLocal,
} from "./format";

describe("normalizeUzPhone", () => {
  it("accepts the ways a student types an Uzbek mobile", () => {
    for (const v of ["+998 90 123-45-67", "998901234567", "901234567", " (90) 123 45 67 "]) {
      expect(normalizeUzPhone(v)).toBe("998901234567");
    }
  });
  it("refuses anything that is not 9 local digits", () => {
    for (const v of ["", "90123456", "9012345678", "+7 901 234 56 78", "+44 7911 123456", "abc", null, undefined]) {
      expect(normalizeUzPhone(v)).toBeNull();
    }
  });
});

describe("localUzDigits", () => {
  it("strips a pasted +998 so it is not doubled", () => {
    expect(localUzDigits("+998 90 123 45 67")).toBe("901234567");
    expect(localUzDigits("998901234567")).toBe("901234567");
  });
  it("keeps a partial number and caps at 9", () => {
    expect(localUzDigits("90 12")).toBe("9012");
    expect(localUzDigits("9012345678999")).toBe("901234567");
  });
});

describe("display", () => {
  it("spaces as typed", () => {
    expect(spaceUzLocal("901234567")).toBe("90 123 45 67");
    expect(spaceUzLocal("9012")).toBe("90 12");
  });
  it("formats a stored number", () => {
    expect(formatUzPhone("998901234567")).toBe("+998 90 123 45 67");
    expect(formatUzPhone(null)).toBe("");
  });
});

describe("buildResultSms", () => {
  const url = "https://mockonline.uz/a/AB12CD";

  it("is the agreed text", () => {
    expect(buildResultSms({ overall: 6.5, listening: 7, reading: 6.5, writing: 6, url })).toBe(
      "MockOnline: Thank you for taking a mock with us!\n\nOverall: 6.5\nListening: 7.0\nReading: 6.5\nWriting: 6.0\n\nDownload your answers: " +
        url,
    );
  });

  it("costs one SMS with all sections and the longest bands", () => {
    const text = buildResultSms({ overall: 9, listening: 9, reading: 9, writing: 9, url });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(isGsm7(text)).toBe(true);
    expect(isSingleGsmSegment(text)).toBe(true);
  });

  it("leaves out sections the mock did not have", () => {
    const text = buildResultSms({ overall: 6, reading: 6, url });
    expect(text).not.toContain("Listening");
    expect(text).not.toContain("Writing");
  });

  it("notices a non-GSM character", () => {
    expect(isSingleGsmSegment("Natija — 6.5")).toBe(false);
  });
});
