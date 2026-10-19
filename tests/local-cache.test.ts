import { expect, test } from "bun:test";
import { createLocalClient } from "../src/client/local/client";
import { createApiClient } from "../src/client/api-client";

// Guests never reach the network: the origin is never contacted.
const client = (values: Map<string, string>, removeItem = (k: string) => void values.delete(k)) => createLocalClient({
  autoSync: false,
  storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem },
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

test("changes are journaled alone, replayed once on reopening, and written whole once the journal is long", async () => {
  const values = new Map<string, string>(), key = "cubix.local.v1:workspace:guest", a = client(values);
  const session = await a.api.createSession("playground"), whole = values.get(key);
  const first = await a.api.addSolve({ sessionId: session.id, timeMs: 10000 }), second = await a.api.addSolve({ sessionId: session.id, timeMs: 11000 });
  // Each solve is written alone, after the workspace, which stays as it was.
  expect(values.get(key)).toBe(whole);
  expect([0, 1].map(n => Object.keys(JSON.parse(values.get(`${key}/${n}`)!).solves))).toEqual([[String(first.id)], [String(second.id)]]);
  // Reopened, the workspace is written with them. Its journal left behind (a stop just then), the next change takes
  // its first place: the older second entry is never replayed over the newer workspace.
  const b = client(values, () => {});
  expect(values.get(key)).not.toBe(whole);
  await b.api.setPenalty(second.id, "dnf");
  const c = client(values);
  expect((await c.api.solves("playground")).map(s => [s.time_ms, s.penalty])).toEqual([[11000, "dnf"], [10000, "none"]]);
  expect(values.has(`${key}/0`)).toBe(false);
  // Two hundred entries at most: the next change writes the whole workspace.
  for (let i = 0; i < 200; i++) await c.api.addSolve({ sessionId: session.id, timeMs: 12000 + i });
  expect(values.has(`${key}/199`)).toBe(true);
  await c.api.addSolve({ sessionId: session.id, timeMs: 9000 });
  expect(values.has(`${key}/0`)).toBe(false);
  expect(Object.keys(JSON.parse(values.get(key)!).solves)).toHaveLength(203);
  expect(client(values).read.profile().playground.summary).toMatchObject({ count: 203, best: 9000 });
});
