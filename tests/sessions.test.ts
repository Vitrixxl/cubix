import { afterEach, expect, test } from "bun:test";
import { createLocalClient } from "../src/client/local/client";
import { createApiClient } from "../src/client/api-client";
import { resumes, sessionSummaries } from "../src/client/lib/sessions";
import { startApi, openDb } from "./backend";
import type { SolveDto } from "../src/shared/types";

const solve = (id: number, session: number | null, at: string, time: number, penalty: SolveDto["penalty"] = "none") =>
  ({ id, session_id: session, case_id: null, time_ms: time, penalty, scramble: null, created_at: at }) as SolveDto;

test("one summary per session, solves outside any session grouped by day, started sessions without solves kept", () => {
  const sessions = { 1: { id: 1, name: "Comp prep", created_at: "2026-10-01T08:00:00.000Z" }, 2: { id: 2, created_at: "2026-10-03T08:00:00.000Z" } };
  const solves = [
    solve(10, null, "2026-09-30T08:00:00.000Z", 9000),
    solve(11, null, "2026-09-30T09:00:00.000Z", 11000),
    ...[12000, 10000, 14000, 11000, 13000, 0].map((t, i) => solve(20 + i, 1, `2026-10-01T08:0${i}:00.000Z`, t, i === 5 ? "dnf" : "none")),
    solve(30, null, "2026-10-02T08:00:00.000Z", 15000),
    // A solve of a session this device does not know (deleted elsewhere) joins its day.
    solve(31, 99, "2026-10-02T09:00:00.000Z", 17000),
  ];
  const out = sessionSummaries(solves, sessions, [2]);
  expect(out.map((x) => [x.id, x.name, x.count])).toEqual([[null, null, 2], [1, "Comp prep", 6], [null, null, 2], [2, null, 0]]);
  expect(out[1]).toMatchObject({ best: 10000, mean: 12000, ao5: 12000, ao12: null });
  expect(out[2]).toMatchObject({ mean: 16000, at: "2026-10-02T08:00:00.000Z" });
});

test("the timer resumes a named session, or one used today", () => {
  const now = new Date("2026-10-10T18:00:00");
  expect(resumes(undefined, now)).toBe(false);
  expect(resumes({ lastAt: new Date("2026-10-10T07:00:00").toISOString() }, now)).toBe(true);
  expect(resumes({ lastAt: new Date("2026-10-09T23:00:00").toISOString() }, now)).toBe(false);
  expect(resumes({ name: "Comp prep", lastAt: "2025-01-01T00:00:00.000Z" }, now)).toBe(true);
});

class Storage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
function device(origin: string) {
  const storage = new Storage();
  const local = createLocalClient({
    storage, autoSync: false,
    getToken: () => storage.getItem("token"), setToken: (t) => storage.setItem("token", t), clearToken: () => storage.removeItem("token"),
    remote: (token) => createApiClient(origin, { getToken: () => token }),
  });
  cleanup.push(local.stop);
  return local;
}

test("session names are saved offline first, then reach the other devices; imported sessions keep theirs", async () => {
  const db = openDb(), server = startApi(db.path);
  cleanup.push(() => db.db.close());
  const origin = `http://127.0.0.1:${server.server.port}`, a = device(origin), b = device(origin);
  await a.api.register("sessions_alice", "a-long-test-password");
  const session = await a.api.createSession("playground", [], "333", {});
  await a.api.addSolve({ sessionId: session.id, timeMs: 12000, puzzle: "333" });
  // Renamed twice before syncing: only the latest name goes up.
  await a.api.renameSession(session.id, "Morning");
  await a.api.renameSession(session.id, "  Comp prep  ");
  await a.api.importSolves([{ event: "333", timeMs: 9000, penalty: "none", scramble: null, comment: null, at: Date.parse("2026-01-01T10:00:00Z"), session: "OH warmup" }]);
  expect(a.read.sessions("333").map((x) => x.name).sort()).toEqual(["Comp prep", "OH warmup"]);
  await a.sync();
  expect(a.status()).toMatchObject({ state: "synced", pending: 0 });
  expect(db.db.query<{ name: string }, []>("SELECT name FROM sessions ORDER BY name").all().map((r) => r.name)).toEqual(["Comp prep", "OH warmup"]);
  await b.api.login("sessions_alice", "a-long-test-password");
  await b.sync();
  expect(b.read.sessions("333").map((x) => [x.name, x.count]).sort()).toEqual([["Comp prep", 1], ["OH warmup", 1]]);
  // Cleared on one device: the other shows its day and event again.
  const named = b.read.sessions("333").find((x) => x.name === "Comp prep")!;
  await b.api.renameSession(named.id!, "");
  await b.sync();
  await a.sync();
  expect(a.read.sessions("333").map((x) => x.name).sort()).toEqual(["OH warmup", null]);
});
