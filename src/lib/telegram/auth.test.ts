import { describe, it, expect, afterEach } from "vitest";
import { verifyWebhookSecret, isOwner, secretsMatch, SECRET_HEADER } from "./auth";

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const OWNER = process.env.TELEGRAM_OWNER_ID;

afterEach(() => {
  if (SECRET === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  if (OWNER === undefined) delete process.env.TELEGRAM_OWNER_ID;
  else process.env.TELEGRAM_OWNER_ID = OWNER;
});

const req = (headers: Record<string, string> = {}) =>
  new Request("https://example.com/api/telegram", { method: "POST", headers });

describe("secretsMatch", () => {
  it("accepts identical strings", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
  });

  it("rejects different strings of the same length", () => {
    expect(secretsMatch("abc123", "abc124")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    // timingSafeEqual throws on unequal buffer lengths; the length check has to
    // come first or this is a 500 instead of a rejection.
    expect(() => secretsMatch("short", "muchlongersecret")).not.toThrow();
    expect(secretsMatch("short", "muchlongersecret")).toBe(false);
  });

  it("rejects the empty string against a real secret", () => {
    expect(secretsMatch("", "secret")).toBe(false);
  });
});

describe("verifyWebhookSecret", () => {
  it("accepts a request carrying the configured secret", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cr3t";
    expect(verifyWebhookSecret(req({ [SECRET_HEADER]: "s3cr3t" }))).toBe(true);
  });

  it("rejects a wrong secret", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cr3t";
    expect(verifyWebhookSecret(req({ [SECRET_HEADER]: "wrong!" }))).toBe(false);
  });

  it("rejects a request with no secret header", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cr3t";
    expect(verifyWebhookSecret(req())).toBe(false);
  });

  // The one that matters: an unconfigured deployment must refuse everything
  // rather than wave everything through.
  it("fails closed when TELEGRAM_WEBHOOK_SECRET is unset", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(verifyWebhookSecret(req({ [SECRET_HEADER]: "anything" }))).toBe(false);
  });
});

describe("isOwner", () => {
  it("accepts the configured id", () => {
    process.env.TELEGRAM_OWNER_ID = "123456789";
    expect(isOwner(123456789)).toBe(true);
  });

  it("tolerates whitespace around the configured id", () => {
    process.env.TELEGRAM_OWNER_ID = " 123456789 ";
    expect(isOwner(123456789)).toBe(true);
  });

  it("rejects any other id", () => {
    process.env.TELEGRAM_OWNER_ID = "123456789";
    expect(isOwner(987654321)).toBe(false);
  });

  it("rejects a missing sender", () => {
    process.env.TELEGRAM_OWNER_ID = "123456789";
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it("fails closed when TELEGRAM_OWNER_ID is unset", () => {
    delete process.env.TELEGRAM_OWNER_ID;
    expect(isOwner(123456789)).toBe(false);
  });

  it("fails closed when TELEGRAM_OWNER_ID is not a number", () => {
    process.env.TELEGRAM_OWNER_ID = "@myhandle";
    expect(isOwner(123456789)).toBe(false);
    // NaN must not equal NaN into an accidental pass.
    expect(isOwner(Number.NaN)).toBe(false);
  });
});
