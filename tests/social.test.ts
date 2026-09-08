import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi, openDb } from "./backend";
import { createApiClient } from "../src/frontend/api-client";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
async function setup() {
  const db = openDb(":memory:");
  const app = createApi(db).listen({ port: 0, hostname: "127.0.0.1" });
  cleanups.push(() => { app.server?.stop(true); db.db.close(); });
  const origin = `http://127.0.0.1:${app.server!.port}`;
  const member = async (username: string) => {
    let token: string | null = null;
    const api = createApiClient(origin, { getToken: () => token });
    const registered = await api.register(username, "a-long-test-password");
    token = registered.token;
    return { api, ...registered };
  };
  const alice = await member("alice");
  const bob = await member("bob");
  const eve = await member("eve");
  return { alice, bob, eve, db, origin };
}
const body = (text: string, solveId?: number) => ({ text, solveId, clientId: crypto.randomUUID() });

async function live(origin: string, token: string) {
  const ws = new WebSocket(origin.replace("http:", "ws:") + "/api/social/live");
  // Close sockets before the database/server during teardown.
  cleanups.unshift(() => ws.close());
  const events: string[] = [];
  const wait = (type: string) => new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { ws.removeEventListener("message", listener); reject(new Error(`Missing ${type} event`)); }, 2000);
    const listener = (event: MessageEvent) => {
      if (JSON.parse(String(event.data)).type === type) { clearTimeout(timeout); ws.removeEventListener("message", listener); resolve(); }
    };
    ws.addEventListener("message", listener);
  });
  ws.addEventListener("message", e => events.push(JSON.parse(String(e.data)).type));
  const ready = wait("ready");
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "auth", token })));
  await ready;
  return { ws, events, wait };
}

test("friend consent, message isolation, verified time snapshots and idempotent sending", async () => {
  const { alice, bob, eve } = await setup();
  expect((await alice.api.users("bob")).map(user => user.id)).toEqual([bob.user.id]);
  const [request] = await alice.api.addFriend("bob");
  await expect(alice.api.sendMessage(bob.user.id, body("Too early"))).rejects.toMatchObject({ status: 403 });
  await expect(alice.api.acceptFriend(request.id)).rejects.toMatchObject({ status: 404 });
  await expect(eve.api.acceptFriend(request.id)).rejects.toMatchObject({ status: 404 });
  await bob.api.acceptFriend(request.id);
  expect((await alice.api.friends())[0].status).toBe("accepted");
  await expect(alice.api.addFriend("bob")).rejects.toMatchObject({ status: 409 });
  const solve = await alice.api.addSolve({ sessionId: null, caseId: "PLL Aa", timeMs: 1234, penalty: "+2", scramble: "R U R'" });
  await expect(bob.api.sharedSolve(solve.id)).rejects.toMatchObject({ status: 404 });
  await expect(bob.api.sendMessage(alice.user.id, body("Stolen", solve.id))).rejects.toMatchObject({ status: 404 });
  const payload = body("New personal best!", solve.id);
  const sent = await alice.api.sendMessage(bob.user.id, payload);
  expect((await alice.api.sendMessage(bob.user.id, payload)).id).toBe(sent.id);
  expect((await bob.api.messages(alice.user.id))).toHaveLength(1);
  expect(sent.solve).toMatchObject({ id: solve.id, time_ms: 1234, penalty: "+2", scramble: "R U R'" });
  expect(sent.solve).not.toHaveProperty("user_id");
  await alice.api.deleteSolve(solve.id);
  expect((await bob.api.messages(alice.user.id))[0].solve).toEqual(sent.solve);
  await expect(eve.api.messages(alice.user.id)).rejects.toMatchObject({ status: 403 });
  await expect(eve.api.removeFriend(request.id)).rejects.toMatchObject({ status: 404 });
  await expect(alice.api.sendMessage(bob.user.id, body("   "))).rejects.toMatchObject({ status: 400 });
  await alice.api.removeFriend(request.id);
  await expect(bob.api.messages(alice.user.id)).rejects.toMatchObject({ status: 403 });
  await expect(bob.api.sendMessage(alice.user.id, body("Removed"))).rejects.toMatchObject({ status: 403 });
});

test("live updates reach only participants; revoked sockets cannot receive updates", async () => {
  const { alice, bob, eve, origin } = await setup();
  const a = await live(origin, alice.token);
  const b = await live(origin, bob.token);
  const e = await live(origin, eve.token);
  const requested = b.wait("changed");
  const [request] = await alice.api.addFriend("bob");
  await requested;
  const accepted = a.wait("changed");
  await bob.api.acceptFriend(request.id);
  await accepted;
  const delivered = b.wait("changed");
  const acknowledged = a.wait("sent");
  const payload = body("Hello in real time");
  a.ws.send(JSON.stringify({ type: "send", peer: bob.user.id, ...payload }));
  await Promise.all([delivered, acknowledged]);
  await alice.api.sendMessage(bob.user.id, payload); // retry after a lost acknowledgement
  expect(await bob.api.messages(alice.user.id)).toHaveLength(1);
  const denied = e.wait("error");
  e.ws.send(JSON.stringify({ type: "send", peer: alice.user.id, ...body("Not a friend") }));
  await denied;
  expect((await bob.api.messages(alice.user.id))[0].text).toBe("Hello in real time");
  expect(e.events).toEqual(["ready", "error"]);
  await bob.api.logout();
  const closed = new Promise<CloseEvent>(resolve => b.ws.addEventListener("close", resolve, { once: true }));
  await alice.api.sendMessage(bob.user.id, body("Stored while offline"));
  expect((await closed).code).toBe(4001);
  const login = await bob.api.login("bob", "a-long-test-password");
  const reconnected = await live(origin, login.token);
  expect(reconnected.events).toEqual(["ready"]);
  const fresh = createApiClient(origin, { getToken: () => login.token });
  expect(await fresh.messages(alice.user.id)).toHaveLength(2);
});

test("history pagination and guest denial", async () => {
  const { alice, bob, origin } = await setup();
  const [request] = await alice.api.addFriend("bob");
  await bob.api.acceptFriend(request.id);
  for (let i = 0; i < 52; i++) await alice.api.sendMessage(bob.user.id, body(`Message ${i}`));
  const latest = await bob.api.messages(alice.user.id);
  expect(latest).toHaveLength(50);
  const older = await bob.api.messages(alice.user.id, latest[0].id);
  expect(older.map(m => m.text)).toEqual(["Message 0", "Message 1"]);
  let token: string | null = null;
  const guest = createApiClient(origin, { getToken: () => token });
  token = (await guest.guest()).token;
  await expect(guest.friends()).rejects.toMatchObject({ status: 403 });
  const ws = new WebSocket(origin.replace("http:", "ws:") + "/api/social/live");
  cleanups.unshift(() => ws.close());
  const closed = new Promise<CloseEvent>(resolve => ws.addEventListener("close", resolve, { once: true }));
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "auth", token })));
  expect((await closed).code).toBe(4001);
});


test("friendships and shared messages survive restarting the database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cubix-chat-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "chat.db");
  const firstDb = openDb(path);
  const first = createApi(firstDb).listen({ port: 0, hostname: "127.0.0.1" });
  let aliceToken: string | null = null;
  let bobToken: string | null = null;
  const origin = `http://127.0.0.1:${first.server!.port}`;
  const alice = createApiClient(origin, { getToken: () => aliceToken });
  const bob = createApiClient(origin, { getToken: () => bobToken });
  let aliceId = "";
  try {
    const a = await alice.register("alice", "a-long-test-password"); aliceToken = a.token; aliceId = a.user.id;
    const b = await bob.register("bob", "a-long-test-password"); bobToken = b.token;
    const [request] = await alice.addFriend("bob");
    await bob.acceptFriend(request.id);
    const solve = await alice.addSolve({ sessionId: null, caseId: null, timeMs: 9990 });
    await alice.sendMessage(b.user.id, body("Saved for later", solve.id));
  } finally { first.server?.stop(true); firstDb.db.close(); }
  const secondDb = openDb(path);
  const second = createApi(secondDb).listen({ port: 0, hostname: "127.0.0.1" });
  try {
    const restored = createApiClient(`http://127.0.0.1:${second.server!.port}`, { getToken: () => bobToken });
    expect((await restored.friends())[0].status).toBe("accepted");
    const messages = await restored.messages(aliceId);
    expect(messages[0].text).toBe("Saved for later");
    expect(messages[0].solve?.time_ms).toBe(9990);
  } finally { second.server?.stop(true); secondDb.db.close(); }
});
