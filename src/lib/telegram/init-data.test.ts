import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { INIT_DATA_MAX_AGE_S, dataCheckString, signInitData, verifyInitData } from "./init-data";

const TOKEN = "123456:TEST-token-not-real";
const NOW = 1_800_000_000;
const user = (o: Record<string, unknown> = {}) => JSON.stringify({ id: 42, first_name: "Aziz", language_code: "uz", ...o });
const make = (fields: Record<string, string> = {}, token = TOKEN) =>
  signInitData({ auth_date: String(NOW - 10), query_id: "AAE", user: user(), ...fields }, token);

describe("verifyInitData", () => {
  it("accepts what Telegram would sign", () => {
    const r = verifyInitData(make(), TOKEN, NOW);
    expect(r).toEqual({ ok: true, authDate: NOW - 10, user: { tgUserId: 42, firstName: "Aziz", languageCode: "uz" } });
  });

  it("matches the documented algorithm independently of signInitData", () => {
    const params = new URLSearchParams({ user: user(), auth_date: String(NOW), query_id: "Q" });
    const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
    params.set("hash", createHmac("sha256", secret).update(dataCheckString(params)).digest("hex"));
    expect(verifyInitData(params.toString(), TOKEN, NOW).ok).toBe(true);
    expect(dataCheckString(params)).toBe(`auth_date=${NOW}\nquery_id=Q\nuser=${user()}`);
  });

  it("refuses a tampered field (someone else's id)", () => {
    const p = new URLSearchParams(make());
    p.set("user", user({ id: 43 }));
    expect(verifyInitData(p.toString(), TOKEN, NOW)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("refuses another bot's signature", () => {
    expect(verifyInitData(make({}, "999:other"), TOKEN, NOW)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("refuses an old or future-dated one", () => {
    expect(verifyInitData(make({ auth_date: String(NOW - INIT_DATA_MAX_AGE_S - 1) }), TOKEN, NOW)).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(verifyInitData(make({ auth_date: String(NOW + 600) }), TOKEN, NOW)).toEqual({ ok: false, reason: "stale" });
    expect(verifyInitData(make({ auth_date: String(NOW - INIT_DATA_MAX_AGE_S) }), TOKEN, NOW).ok).toBe(true);
  });

  it("needs a real user", () => {
    expect(verifyInitData(make({ user: "" }), TOKEN, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyInitData(make({ user: JSON.stringify({ first_name: "x" }) }), TOKEN, NOW)).toEqual({
      ok: false,
      reason: "no_user",
    });
    expect(verifyInitData(make({ user: user({ is_bot: true }) }), TOKEN, NOW)).toEqual({ ok: false, reason: "no_user" });
    expect(verifyInitData(make({ user: user({ id: "42" }) }), TOKEN, NOW)).toEqual({ ok: false, reason: "no_user" });
  });

  it("refuses junk without throwing", () => {
    for (const junk of ["", "hash=zz", "a=1", "x".repeat(5000)]) {
      expect(verifyInitData(junk, TOKEN, NOW).ok).toBe(false);
    }
    expect(verifyInitData(make(), "", NOW).ok).toBe(false);
  });

  it("refuses a duplicated key", () => {
    const signed = make();
    expect(verifyInitData(`${signed}&auth_date=${NOW}`, TOKEN, NOW)).toEqual({ ok: false, reason: "malformed" });
  });
});
