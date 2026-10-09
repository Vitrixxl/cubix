/** The app's one socket, /api/live (go-api/live.go, src/client/live.ts): every live feature on it, and its keep-alive. */
import { afterEach, expect, test } from "bun:test";
import { createConnection } from "node:net";
import { startApi, openDb } from "./backend";
import { createApiClient } from "../src/client/api-client";
import { createLocalClient } from "../src/client/local/client";
import { createLive, type LiveMessage } from "../src/client/live";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(close => close()));
const until = async (predicate: () => boolean | Promise<boolean>, wait = 5000) => {
  const end = Date.now() + wait;
  while (!await predicate()) { if (Date.now() > end) throw new Error("Nothing came"); await Bun.sleep(10); }
};
const json = (origin: string, path: string, token: string, body?: unknown) =>
  fetch(origin + "/api/" + path, { method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(r => r.json());

test("a signed-in app opens one socket, and sync, coaching, the community, duels and matches all travel on it", async () => {
  const { path } = openDb(), origin = `http://127.0.0.1:${startApi(path).server.port}`;
  const opened: string[] = [], Real = globalThis.WebSocket;
  globalThis.WebSocket = class extends Real { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); opened.push(String(url)); } } as typeof WebSocket;
  cleanups.push(() => { globalThis.WebSocket = Real; });
  const values = new Map<string, string>();
  const local = createLocalClient({ autoSync: false,
    storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } },
    getToken: () => values.get("token") ?? null, setToken: t => { values.set("token", t); }, clearToken: () => { values.delete("token"); },
    remote: token => createApiClient(origin, { getToken: () => token }),
  });
  cleanups.push(local.stop);
  const me = await local.api.register("one_socket", "a-long-test-password");
  const friend = await createApiClient(origin, { getToken: () => null }).register("other_app", "a-long-test-password");
  const live = createLive(local, () => values.get("token") ?? null);
  cleanups.push(live.stop);
  const heard: LiveMessage[] = [];
  live.on("*", m => heard.push(m));
  const hear = (channel: string, test: (m: any) => boolean) => until(() => heard.some(m => m.channel === channel && test(m)));
  live.ensure();
  await hear("live", m => m.type === "ready" && m.user.id === me.user.id && m.again === false);

  // Sync: another device's upload reaches this one as changes on the socket; this one uploads on it too.
  const laptop = await createApiClient(origin, { getToken: () => null }).login("one_socket", "a-long-test-password");
  await json(origin, "solves", laptop.token, { timeMs: 12345 });
  await until(async () => (await local.api.solves("playground")).length === 1);
  await local.api.setLearned("PLL Aa", true);
  await local.sync();
  expect(await json(origin, "learned", laptop.token)).toEqual(["PLL Aa"]);
  // The community: a friend request.
  await json(origin, "social/friends", friend.token, { username: "one_socket" });
  await hear("social", m => m.type === "request" && m.from.username === "other_app");
  // Coaching: a call of a session the account does not have.
  expect(live.send({ channel: "coaching", type: "join", booking: "no-such-session" })).toBe(true);
  await hear("coaching", m => m.type === "ended" && m.reason === "Unknown session");
  // A duel search, under the account's name.
  live.send({ channel: "duel", type: "queue", event: "333" });
  await hear("duel", m => m.type === "queued");
  // A match, refused by its id.
  live.send({ channel: "match", type: "join", match: 424242 });
  await hear("match", m => m.type === "error" && m.match === 424242);

  expect(opened).toEqual([origin.replace("http:", "ws:") + "/api/live"]);
  expect(heard.some(m => m.channel === "sync")).toBe(false);
}, 20000);

test("an app without an account races on its socket, while sync and calls are refused", async () => {
  const { path } = openDb(), origin = `http://127.0.0.1:${startApi(path).server.port}`;
  const ws = new WebSocket(origin.replace("http:", "ws:") + "/api/live");
  cleanups.push(() => ws.close());
  const heard: any[] = [];
  ws.onmessage = e => heard.push(JSON.parse(String(e.data)));
  await new Promise(r => (ws.onopen = r));
  const send = (m: object) => ws.send(JSON.stringify(m));
  send({ channel: "live", type: "auth" });
  await until(() => heard.some(m => m.type === "ready"));
  expect(heard[0]).toEqual({ channel: "live", type: "ready", user: null });
  send({ channel: "sync", type: "pull", requestId: "r1", after: 0 });
  send({ channel: "coaching", type: "join", booking: "b1" });
  send({ channel: "duel", type: "queue", event: "333" });
  await until(() => heard.some(m => m.type === "queued"));
  expect(heard.slice(1, 4)).toEqual([
    { channel: "sync", type: "result", requestId: "r1", status: 403, error: "Sign in to synchronize." },
    { channel: "coaching", type: "ended", booking: "b1", reason: "Please sign in again." },
    { channel: "duel", type: "queued" },
  ]);
});

test("the server's pings keep a quiet app connected past the idle limit, and drop a peer that no longer answers", async () => {
  // A ping a second: a socket that sends nothing at all, not even a pong, is gone after three.
  const { path } = openDb(), port = startApi(path, { CUBIX_PING_SECONDS: "1" }).server.port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/live`);
  cleanups.push(() => ws.close());
  let closed = false;
  ws.onclose = () => { closed = true; };
  await new Promise(r => (ws.onopen = r));
  ws.send(JSON.stringify({ channel: "live", type: "auth" }));

  // A peer that signs in, then never answers a ping: a raw connection.
  const raw = createConnection(port, "127.0.0.1");
  cleanups.push(() => raw.destroy());
  let rawClosed = 0;
  const started = Date.now();
  raw.on("close", () => { rawClosed = Date.now() - started; });
  raw.on("error", () => {});
  raw.on("data", () => {});
  await new Promise(r => raw.once("connect", r));
  raw.write(`GET /api/live HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  const auth = Buffer.from(JSON.stringify({ channel: "live", type: "auth" }));
  // A client's frame is masked; a zero mask leaves the payload as it is.
  raw.write(Buffer.concat([Buffer.from([0x81, 0x80 | auth.length, 0, 0, 0, 0]), auth]));

  await Bun.sleep(6000);
  expect(closed).toBe(false);
  expect(ws.readyState).toBe(WebSocket.OPEN);
  expect(rawClosed).toBeGreaterThan(2500);
  expect(rawClosed).toBeLessThan(6000);
}, 15000);
