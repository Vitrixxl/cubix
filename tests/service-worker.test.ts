import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../scripts/service-worker.js", import.meta.url), "utf8")
  .replace("__VERSION__", "test").replace("__ASSETS__", "[]");

function worker(fetch: (request: { url: string }, options?: RequestInit) => Promise<Response>) {
  const events: Record<string, (event: any) => void> = {};
  const navigated: string[] = [], deleted: string[] = [];
  let claimed = false;
  const cache = { match: async () => new Response("offline shell"), addAll: async () => {} };
  const clients = ["/", "/aaaaadmin"].map(path => ({
    url: `https://cubix.test${path}`,
    // Browser navigation may wait until activation finishes.
    navigate: (url: string) => { navigated.push(url); return new Promise(() => {}); },
  }));
  runInNewContext(script, {
    URL, AbortController, setTimeout, clearTimeout, fetch,
    caches: {
      open: async () => cache,
      match: async () => undefined,
      keys: async () => ["cubix-shell-oldest", "cubix-shell-previous", "cubix-shell-test", "unrelated-cache"],
      delete: async (key: string) => { deleted.push(key); },
    },
    self: {
      location: { origin: "https://cubix.test" },
      addEventListener: (name: string, handler: (event: any) => void) => { events[name] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => { claimed = true; }, matchAll: async () => clients },
    },
  });
  return {
    navigated, deleted, claimed: () => claimed,
    navigate(path: string) {
      let response: Promise<Response> | undefined;
      events.fetch!({ request: { method: "GET", mode: "navigate", url: `https://cubix.test${path}` }, respondWith: (value: Promise<Response>) => { response = value; } });
      return response;
    },
    activate() {
      let pending: Promise<void> | undefined;
      events.activate!({ waitUntil: (value: Promise<void>) => { pending = value; } });
      return pending;
    },
  };
}

describe("offline worker navigation", () => {
  test("online navigation asks the server even with a cached shell", async () => {
    let calls = 0;
    const sw = worker(async (_, options) => { calls++; expect(options?.cache).toBe("no-cache"); return new Response("fresh server page"); });
    expect(await (await sw.navigate("/"))!.text()).toBe("fresh server page");
    expect(calls).toBe(1);
  });
  test("network failure and server errors fall back to the complete offline build", async () => {
    for (const fetch of [async () => { throw new TypeError("Offline"); }, async () => new Response("Unavailable", { status: 503 })]) {
      expect(await (await worker(fetch).navigate("/"))!.text()).toBe("offline shell");
    }
  });
  test("a server rejection is preserved instead of masked by the cache", async () => {
    const response = await worker(async () => new Response("Rate limited", { status: 429 })).navigate("/");
    expect(response!.status).toBe(429);
  });
  test("admin and API requests bypass the worker; unknown pages use the server", async () => {
    const sw = worker(async () => new Response("Not found", { status: 404 }));
    for (const path of ["/aaaaadmin", "/aaaaadmin/", "/admin/index.js", "/api/admin/dashboard"]) expect(sw.navigate(path)).toBeUndefined();
    expect((await sw.navigate("/unknown-page"))!.status).toBe(404);
  });
  test("activation repairs admin without reloading training or waiting on navigation", async () => {
    const sw = worker(async () => new Response("ok"));
    await sw.activate();
    expect(sw.claimed()).toBe(true);
    expect(sw.navigated).toEqual(["https://cubix.test/aaaaadmin"]);
    expect(sw.deleted).toEqual(["cubix-shell-oldest"]);
  });
});
