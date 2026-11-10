import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fileStore, storageBackend } from "./index";
import { objectKey, presign } from "./r2";

const ENV = {
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_FILES_BUCKET: "mockonline-files",
};

type Call = { url: string; method: string; headers: Headers; body?: unknown };
let calls: Call[] = [];
let respond: (c: Call) => Response;

beforeEach(() => {
  Object.assign(process.env, ENV);
  delete process.env.STORAGE_BACKEND;
  calls = [];
  respond = () => new Response(null, { status: 200 });
  vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const c = { url: req.url, method: req.method, headers: req.headers };
    calls.push(c);
    return respond(c);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backend switch", () => {
  it("defaults to Supabase and only exact 'r2' switches", () => {
    expect(storageBackend()).toBe("supabase");
    process.env.STORAGE_BACKEND = "R2";
    expect(storageBackend()).toBe("supabase");
    process.env.STORAGE_BACKEND = "r2";
    expect(storageBackend()).toBe("r2");
  });

  it("on Supabase hands back the client's own bucket object, untouched", () => {
    const bucketApi = { download: vi.fn() };
    const from = vi.fn(() => bucketApi);
    const client = { storage: { from } } as never;
    expect(fileStore("tests", client)).toBe(bucketApi);
    expect(from).toHaveBeenCalledWith("tests");
  });
});

describe("object keys", () => {
  it("keeps the old bucket as the prefix so file_path never changes", () => {
    expect(objectKey("tests", "reading/0e56ead3.html")).toBe("tests/reading/0e56ead3.html");
    expect(objectKey("mock-assets", "m1/task1 a+b.png")).toBe("mock-assets/m1/task1%20a%2Bb.png");
  });
});

describe("R2 backend", () => {
  beforeEach(() => {
    process.env.STORAGE_BACKEND = "r2";
  });

  it("presigns a GET on the private bucket with the asked lifetime", async () => {
    const url = new URL(await presign("test-media", "reading-intro.mp4", 120));
    expect(url.host).toBe("acct123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/mockonline-files/test-media/reading-intro.mp4");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("caps a presign at SigV4's seven days", async () => {
    const url = new URL(await presign("tests", "a.html", 10 ** 9));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("604800");
  });

  it("upload without upsert refuses to overwrite, like Supabase", async () => {
    respond = () => new Response(null, { status: 412 });
    const { error } = await fileStore("tests", null as never).upload("reading/x.html", new Blob(["<html>"]), {
      contentType: "text/html",
    });
    expect(error?.message).toBe("The resource already exists");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].headers.get("if-none-match")).toBe("*");
    expect(calls[0].headers.get("content-type")).toBe("text/html");
  });

  it("upload with upsert overwrites", async () => {
    const { error } = await fileStore("tests", null as never).upload("a", new Blob(["x"]), { upsert: true });
    expect(error).toBeNull();
    expect(calls[0].headers.get("if-none-match")).toBeNull();
  });

  it("download returns a Blob with the stored type, or an error", async () => {
    respond = () => new Response("hello", { status: 200, headers: { "content-type": "text/plain" } });
    const ok = await fileStore("tests", null as never).download("reading/x.html");
    expect(ok.error).toBeNull();
    expect(await ok.data!.text()).toBe("hello");
    expect(ok.data!.type).toBe("text/plain");

    respond = () => new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    const miss = await fileStore("tests", null as never).download("nope");
    expect(miss.data).toBeNull();
    expect(miss.error?.message).toBe("Download failed: 404 NoSuchKey");
  });

  it("list is one level deep and returns bare names, like Supabase", async () => {
    respond = () =>
      new Response(
        `<ListBucketResult><IsTruncated>false</IsTruncated>
          <Contents><Key>mock-assets/m1/task1-1.png</Key></Contents>
          <Contents><Key>mock-assets/m1/task1-2 &amp; b.png</Key></Contents>
          <CommonPrefixes><Prefix>mock-assets/m1/sub/</Prefix></CommonPrefixes>
        </ListBucketResult>`,
        { status: 200 },
      );
    const { data, error } = await fileStore("mock-assets", null as never).list("m1");
    expect(error).toBeNull();
    expect(data).toEqual([{ name: "task1-1.png" }, { name: "task1-2 & b.png" }]);
    const q = new URL(calls[0].url).searchParams;
    expect(q.get("prefix")).toBe("mock-assets/m1/");
    expect(q.get("delimiter")).toBe("/");
  });

  it("createSignedUrls keeps each path next to its URL", async () => {
    const { data } = await fileStore("speaking", null as never).createSignedUrls(["u/s/part1.wav", "u/s/part2.wav"], 3600);
    expect(data?.map((d) => d.path)).toEqual(["u/s/part1.wav", "u/s/part2.wav"]);
    expect(new URL(data![1].signedUrl).pathname).toBe("/mockonline-files/speaking/u/s/part2.wav");
  });
});
