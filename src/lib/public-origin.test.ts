import { describe, it, expect, afterEach } from "vitest";
import { publicOrigin } from "./public-origin";

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

const ENV = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ENV;
});

describe("publicOrigin", () => {
  it("is the DigitalOcean bug: request.url is localhost:8080 behind their proxy", () => {
    // What the container actually sees. The forwarded headers carry the truth.
    const r = req("https://localhost:8080/api/test-html/abc", {
      "x-forwarded-host": "mockonline.uz",
      "x-forwarded-proto": "https",
    });
    expect(new URL(r.url).origin).toBe("https://localhost:8080"); // the trap
    expect(publicOrigin(r)).toBe("https://mockonline.uz");
  });

  it("falls back to the Host header when there is no x-forwarded-host", () => {
    const r = req("https://localhost:8080/x", { host: "mockonline.uz" });
    expect(publicOrigin(r)).toBe("https://mockonline.uz");
  });

  it("takes the first entry when a proxy sends a list", () => {
    const r = req("https://localhost:8080/x", {
      "x-forwarded-host": "mockonline.uz, internal.proxy",
      "x-forwarded-proto": "https, http",
    });
    expect(publicOrigin(r)).toBe("https://mockonline.uz");
  });

  it("ignores a loopback Host and uses the configured site URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://mockonline.uz";
    const r = req("https://localhost:8080/x", { host: "localhost:8080" });
    expect(publicOrigin(r)).toBe("https://mockonline.uz");
  });

  it("strips a trailing slash from the configured site URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://mockonline.uz/";
    const r = req("https://localhost:8080/x", { host: "127.0.0.1:8080" });
    expect(publicOrigin(r)).toBe("https://mockonline.uz");
  });

  it("still works in local development, where localhost is the real origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const r = req("http://localhost:3000/x", { host: "localhost:3000" });
    expect(publicOrigin(r)).toBe("http://localhost:3000");
  });

  it("prefers the forwarded host over a configured site URL", () => {
    // A preview host must not be rewritten to the production address.
    process.env.NEXT_PUBLIC_SITE_URL = "https://mockonline.uz";
    const r = req("https://localhost:8080/x", {
      "x-forwarded-host": "mockonline-2m8db.ondigitalocean.app",
    });
    expect(publicOrigin(r)).toBe("https://mockonline-2m8db.ondigitalocean.app");
  });

  it("honours a forwarded http scheme", () => {
    const r = req("https://localhost:8080/x", {
      "x-forwarded-host": "example.test",
      "x-forwarded-proto": "http",
    });
    expect(publicOrigin(r)).toBe("http://example.test");
  });
});
