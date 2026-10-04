import { expect, test } from "bun:test";
import { createLocalClient } from "../src/client/local/client";
import { createApiClient } from "../src/client/api-client";

// Guests never reach the network: the origin is never contacted.
const client = (values: Map<string, string>) => createLocalClient({
  autoSync: false,
  storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: k => void values.delete(k) },
  getToken: () => null, setToken: () => {}, clearToken: () => {},
  remote: token => createApiClient("http://127.0.0.1:1", { getToken: () => token }),
});

test("the parsed workspace is kept in memory, yet a change by another client sharing the storage is seen", async () => {
  const values = new Map<string, string>(), a = client(values), b = client(values);
  const session = await a.api.createSession("playground");
  await a.api.addSolve({ sessionId: session.id, timeMs: 10000 });
  const first = a.read.profile();
  // Unchanged data: the very same objects, nothing computed again.
  expect(a.read.profile()).toBe(first);
  expect(a.read.stats()).toBe(a.read.stats());
  expect(b.read.profile().playground.summary.count).toBe(1);
  await b.api.addSolve({ sessionId: session.id, timeMs: 12000 });
  const next = a.read.profile();
  expect(next).not.toBe(first);
  expect(next.playground.summary.count).toBe(2);
  expect((await a.api.solves("playground")).map(s => s.time_ms)).toEqual([12000, 10000]);
});

test("a change that fails leaves nothing half-done in memory", async () => {
  const values = new Map<string, string>(), a = client(values);
  const session = await a.api.createSession("playground");
  await a.api.addSolve({ sessionId: session.id, timeMs: 10000 });
  await expect(a.api.addSolve({ sessionId: session.id, timeMs: -1 })).rejects.toThrow();
  await expect(a.api.setPenalty(123456, "dnf")).rejects.toThrow();
  expect(a.read.profile().playground.summary.count).toBe(1);
  expect(client(values).read.profile().playground.summary).toEqual(a.read.profile().playground.summary);
});
