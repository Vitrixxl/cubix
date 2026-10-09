import { afterEach, expect, test } from "bun:test";
import { startApi, openDb } from "./backend";
import { createApiClient, type LiveOutput } from "../src/client/api-client";
import { createLocalClient } from "../src/client/local/client";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(close => close()));
const until = async (predicate: () => boolean | Promise<boolean>) => {
  const end = Date.now() + 5000;
  while (!await predicate()) { if (Date.now() > end) throw new Error("Live sync did not converge"); await new Promise(r => setTimeout(r, 10)); }
};
function setup() {
  const { db, path } = openDb(); cleanups.push(() => db.close());
  const server = startApi(path);
  const origin = `http://127.0.0.1:${server.server.port}`;
  const device = () => {
    const values = new Map<string, string>();
    let requests = 0;
    const local = createLocalClient({ autoSync: false,
      storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } },
      getToken: () => values.get("token") ?? null, setToken: t => { values.set("token", t); }, clearToken: () => { values.delete("token"); },
      remote: token => {
        const api = createApiClient(origin, { getToken: () => token });
        return { ...api,
          me: () => { requests++; return api.me(); },
          syncPush: ops => { requests++; return api.syncPush(ops); },
          syncPull: cursor => { requests++; return api.syncPull(cursor); },
        };
      },
    });
    cleanups.push(local.stop);
    const connect = async () => {
      const socket = local.api.connectLive(); cleanups.push(socket.close);
      const frames: LiveOutput[] = [];
      const ready = Promise.withResolvers<void>();
      socket.on("open", () => socket.send({ channel: "live", type: "auth", token: values.get("token")!, after: local.liveCursor() }));
      socket.on("message", ({ data }) => {
        frames.push(data);
        const applied = local.receiveLive(socket, data);
        if (data.channel === "live" && data.type === "ready") applied.then(() => ready.resolve(), ready.reject);
      });
      socket.on("close", () => local.disconnected(socket));
      await ready.promise;
      return { socket, frames };
    };
    return { local, connect, requests: () => requests, token: () => values.get("token")! };
  };
  return { db, origin, device };
}

test("connected devices upload and apply changed entities with zero HTTP sync requests", async () => {
  const { device } = setup(), a = device(), b = device(), other = device();
  await a.local.api.register("socket_alice", "a-long-test-password");
  await b.local.api.login("socket_alice", "a-long-test-password");
  await other.local.api.register("socket_bob", "a-long-test-password");
  const first = await a.connect(), second = await b.connect(), isolated = await other.connect();
  const requests = [a.requests(), b.requests(), other.requests()];
  const session = await a.local.api.createSession("playground");
  const solve = await a.local.api.addSolve({ sessionId: session.id, timeMs: 12345 });
  await a.local.sync();
  await until(async () => (await b.local.api.solves("playground")).length === 1 && (await a.local.api.solves("playground")).length === 1);
  await a.local.api.setPenalty(solve.id, "+2");
  await a.local.api.setComment(solve.id, "A changed note");
  await a.local.api.setLearned("PLL Aa", true);
  await a.local.sync();
  await until(async () => (await b.local.api.solves("playground"))[0]?.comment === "A changed note" && b.local.learned().includes("PLL Aa"));
  expect((await b.local.api.solves("playground"))[0].penalty).toBe("+2");
  // B has an unsent edit when A deletes: the tombstone must win without an HTTP refresh.
  const remoteSolve = (await b.local.api.solves("playground"))[0];
  await b.local.api.setComment(remoteSolve.id, "Pending while deleted elsewhere");
  await a.local.api.deleteSolve(solve.id); await a.local.sync();
  await until(async () => (await b.local.api.solves("playground")).length === 0);
  expect(b.local.status().pending).toBe(0);
  const framesBefore = second.frames.length;
  await b.local.restore(); await a.local.restore(); // periodic health checks do not poll the API
  expect(second.frames.length).toBe(framesBefore);
  expect([a.requests(), b.requests(), other.requests()]).toEqual(requests);
  expect(isolated.frames.some(f => f.channel === "sync" && f.type === "changes")).toBe(false);
  expect(first.frames.some(f => f.channel === "sync" && f.type === "changes")).toBe(true);
  expect(second.frames.filter(f => f.channel === "sync" && f.type === "changes").every(f => "changes" in f && f.changes.length <= 2)).toBe(true);
  expect(a.local.status()).toMatchObject({ state: "synced", pending: 0 });
});

test("reconnecting catches up paginated changes and preserves pending offline edits over the socket", async () => {
  const { db, device } = setup(), a = device(), b = device();
  const auth = await a.local.api.register("socket_reconnect", "a-long-test-password");
  await b.local.api.login("socket_reconnect", "a-long-test-password");
  const first = await a.connect(), second = await b.connect();
  second.socket.close(); b.local.disconnected(second.socket);
  await b.local.api.setLearned("PLL Ab", true);
  db.transaction(() => {
    const insert = db.query("INSERT INTO solves(user_id,time_ms) VALUES(?,?)");
    for (let i = 0; i < 605; i++) insert.run(auth.user.id, 5000 + i);
  })();
  // A normal mutation wakes the account's stream for this synthetic history too.
  await a.local.api.setLearned("PLL Aa", true); await a.local.sync();
  await until(async () => (await a.local.api.solves("playground", 1000)).length === 605);
  const before = b.requests();
  await b.connect();
  expect(b.requests()).toBe(before);
  expect(await b.local.api.solves("playground", 1000)).toHaveLength(605);
  expect(b.local.learned()).toEqual(["PLL Aa", "PLL Ab"]);
  await until(() => a.local.learned().includes("PLL Ab"));
  expect(first.frames.filter(f => f.channel === "sync" && f.type === "changes").every(f => "changes" in f && f.changes.length <= 500)).toBe(true);
});

test("socket uploads are idempotent and an expired token cannot read or mutate data", async () => {
  const { device, origin, db } = setup(), a = device();
  const auth = await a.local.api.register("socket_receipt", "a-long-test-password");
  const { socket } = await a.connect();
  const op = { id: crypto.randomUUID(), method: "POST", path: "solves", body: { timeMs: 9999 }, createdAt: "2026-01-01T00:00:00.000Z" };
  const result = await socket.syncPush([op]);
  expect(await socket.syncPush([op])).toEqual(result);
  await expect(socket.syncPush([{ ...op, body: { timeMs: 1000 } }])).rejects.toMatchObject({ status: 409 });
  expect(db.query<{ n: number }>("SELECT count(*) n FROM solves WHERE user_id=?").get(auth.user.id)?.n).toBe(1);
  await createApiClient(origin, { getToken: a.token }).logout();
  await expect(socket.syncPull(0)).rejects.toMatchObject({ status: 401 });
});
