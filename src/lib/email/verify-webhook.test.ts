import { describe, expect, it } from "vitest";
import { shouldAdvance, signWebhook, statusForEvent, verifyWebhook } from "./verify-webhook";

const SECRET = "whsec_" + Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64");
const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
const ID = "msg_2abc";
const NOW = 1_789_540_000;
const TS = String(NOW);

const good = (over: Partial<Parameters<typeof verifyWebhook>[0]> = {}) =>
  verifyWebhook({
    secret: SECRET,
    id: ID,
    timestamp: TS,
    signature: signWebhook(SECRET, ID, TS, BODY),
    body: BODY,
    nowS: NOW,
    ...over,
  });

describe("verifyWebhook", () => {
  it("accepts a correctly signed request", () => {
    expect(good()).toEqual({ ok: true });
  });

  it("accepts when several signatures are offered (secret rotation)", () => {
    const other = "whsec_" + Buffer.from("another-secret-of-the-same-size!").toString("base64");
    const signature = `${signWebhook(other, ID, TS, BODY)} ${signWebhook(SECRET, ID, TS, BODY)}`;
    expect(good({ signature })).toEqual({ ok: true });
  });

  it("rejects a signature made with the wrong secret", () => {
    const wrong = "whsec_" + Buffer.from("the-wrong-signing-secret-32-by!!").toString("base64");
    expect(good({ signature: signWebhook(wrong, ID, TS, BODY) })).toEqual({
      ok: false,
      reason: "signature mismatch",
    });
  });

  it("rejects a body that changed by one byte", () => {
    expect(good({ body: BODY.replace("abc", "abd") }).ok).toBe(false);
  });

  it("rejects a replay outside the tolerance", () => {
    expect(good({ nowS: NOW + 6 * 60 })).toEqual({ ok: false, reason: "timestamp outside tolerance" });
    expect(good({ nowS: NOW - 6 * 60 }).ok).toBe(false);
    // just inside is fine
    expect(good({ nowS: NOW + 4 * 60 })).toEqual({ ok: true });
  });

  it("rejects missing headers, a bad timestamp and no secret", () => {
    expect(good({ id: null })).toEqual({ ok: false, reason: "missing svix headers" });
    expect(good({ signature: null })).toEqual({ ok: false, reason: "missing svix headers" });
    expect(good({ timestamp: "later" })).toEqual({ ok: false, reason: "bad timestamp" });
    expect(good({ secret: "" })).toEqual({ ok: false, reason: "no signing secret configured" });
  });

  it("rejects a header with no v1 signature", () => {
    expect(good({ signature: "v0,whatever" })).toEqual({ ok: false, reason: "no v1 signature" });
  });
});

describe("statusForEvent", () => {
  it("maps the events we act on", () => {
    expect(statusForEvent("email.sent")).toBe("sent");
    expect(statusForEvent("email.delivered")).toBe("delivered");
    expect(statusForEvent("email.delivery_delayed")).toBe("delayed");
    expect(statusForEvent("email.bounced")).toBe("bounced");
    expect(statusForEvent("email.complained")).toBe("complained");
    expect(statusForEvent("email.failed")).toBe("failed");
  });

  it("ignores everything else", () => {
    for (const t of ["email.opened", "email.clicked", "contact.created", null, 7]) {
      expect(statusForEvent(t)).toBeNull();
    }
  });
});

describe("shouldAdvance", () => {
  it("moves forward through the happy path", () => {
    expect(shouldAdvance("queued", "sent")).toBe(true);
    expect(shouldAdvance("sent", "delivered")).toBe(true);
    expect(shouldAdvance("delayed", "delivered")).toBe(true);
  });

  it("never goes backwards when events arrive out of order", () => {
    expect(shouldAdvance("delivered", "sent")).toBe(false);
    expect(shouldAdvance("delivered", "delayed")).toBe(false);
    expect(shouldAdvance("sent", "queued")).toBe(false);
  });

  it("lets a terminal state win, and keeps it", () => {
    expect(shouldAdvance("delivered", "bounced")).toBe(true);
    expect(shouldAdvance("sent", "failed")).toBe(true);
    expect(shouldAdvance("bounced", "delivered")).toBe(false);
    expect(shouldAdvance("complained", "sent")).toBe(false);
    expect(shouldAdvance("failed", "bounced")).toBe(false);
  });

  it("ignores a repeat of the same event", () => {
    expect(shouldAdvance("delivered", "delivered")).toBe(false);
  });
});
