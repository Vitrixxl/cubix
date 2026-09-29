import { expect, test, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRustApi } from "./backend";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A duel socket that keeps every message and can wait for the next one of a type. */
async function player(origin: string) {
  const ws = new WebSocket(origin.replace("http:", "ws:") + "/api/duel");
  const inbox: any[] = [];
  const waiting: { type: string; test: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(String(data));
    const i = waiting.findIndex((w) => w.type === m.type && w.test(m));
    if (i >= 0) waiting.splice(i, 1)[0]!.resolve(m);
    else inbox.push(m);
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  cleanups.push(() => ws.close());
  return {
    send: (m: object) => ws.send(JSON.stringify(m)),
    next(type: string, test: (m: any) => boolean = () => true, wait = 3000) {
      const i = inbox.findIndex((m) => m.type === type && test(m));
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise<any>((resolve, reject) => {
        waiting.push({ type, test, resolve });
        setTimeout(() => reject(Error("No " + type + " message")), wait);
      });
    },
    /** Forgets what came so far: the next message waited for is a new one. */
    drain: () => void inbox.splice(0),
    close: () => ws.close(),
  };
}

test("two players of close levels race an Ao5 on the same scrambles", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cubix-duel-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const origin = `http://127.0.0.1:${createRustApi(join(dir, "test.db")).server.port}`;
  const a = await player(origin), b = await player(origin), far = await player(origin);
  // Far slower, and another event: neither is paired with these two.
  far.send({ type: "queue", event: "333", level: 60000 });
  await far.next("queued");
  a.send({ type: "queue", event: "333", level: 12000 });
  b.send({ type: "queue", event: "333", level: 12800 });
  const [ma, mb] = await Promise.all([a.next("match"), b.next("match")]);
  expect(ma.race).toBe(mb.race);
  expect([ma.seat, mb.seat].sort()).toEqual([0, 1]);
  expect(ma.players[0].name).toMatch(/^guest-/);
  const [host, guest] = ma.host ? [a, b] : [b, a];
  const scrambles = ["R U R' U'", "F R U", "L D L'", "B2 U2", "D R2 D'"];
  // Only the host's scrambles count.
  guest.send({ type: "scrambles", list: ["U", "U", "U", "U", "U"] });
  host.send({ type: "scrambles", list: scrambles });
  expect((await guest.next("state", (m) => m.scrambles.length === 5)).scrambles).toEqual(scrambles);

  // The opponent sees the timer start and the chat.
  host.send({ type: "timer", phase: "running" });
  expect((await guest.next("timer")).phase).toBe("running");
  guest.send({ type: "chat", text: "  good luck  " });
  expect(await host.next("chat")).toMatchObject({ text: "good luck" });

  // A solve can be taken back while the other has not finished the round, not after.
  const seatOf = (p: typeof host) => (p === a ? ma.seat : mb.seat);
  host.drain();
  host.send({ type: "solve", round: 0, ms: 9000, penalty: "none" });
  await host.next("state", (m) => m.results[seatOf(host)][0]?.ms === 9000);
  host.send({ type: "cancel", round: 0 });
  await host.next("state", (m) => m.results[seatOf(host)][0] === null);
  for (let round = 0; round < 5; round++) {
    host.drain();
    // Ahead of the round: ignored.
    host.send({ type: "solve", round: round + 1, ms: 1, penalty: "none" });
    host.send({ type: "solve", round, ms: 10000 + round, penalty: "none" });
    await host.next("state", (m) => m.results[seatOf(host)][round]);
    guest.send({ type: "solve", round, ms: 11000 + round, penalty: round === 4 ? "dnf" : "none" });
    await host.next("state", (m) => m.results.every((r: any[]) => r[round]));
  }
  guest.drain();
  // The round is closed: too late to take the solve back.
  guest.send({ type: "cancel", round: 4 });
  host.send({ type: "penalty", round: 2, penalty: "+2" });
  const over = await guest.next("state", (m) => m.results[seatOf(host)][2]?.penalty === "+2");
  expect(over.results[seatOf(guest)][4]).toEqual({ ms: 11004, penalty: "dnf" });
  expect(over.results[seatOf(host)].map((r: any) => r.ms)).toEqual([10000, 10001, 10002, 10003, 10004]);

  // A rematch starts once both ask, on new scrambles from the host.
  guest.drain();
  host.send({ type: "rematch" });
  expect((await guest.next("state", (m) => m.rematch.includes(true))).game).toBe(1);
  guest.send({ type: "rematch" });
  const again = await host.next("state", (m) => m.game === 2);
  expect(again.scrambles).toEqual([]);
  expect(again.results.flat().every((r: any) => r === null)).toBe(true);

  // Leaving tells the opponent.
  guest.close();
  await host.next("left");
  expect((await host.next("state", (m) => m.present.includes(false))).present[seatOf(guest)]).toBe(false);

  // Alone for long enough, the far player meets anyone searching.
  const late = await player(origin);
  late.send({ type: "queue", event: "333", level: 11000 });
  await Promise.all([far.next("match", () => true, 35000), late.next("match", () => true, 35000)]);
}, 40000);

test("players search their own event, without a level at first", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cubix-duel-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const origin = `http://127.0.0.1:${createRustApi(join(dir, "test.db")).server.port}`;
  const a = await player(origin), b = await player(origin), c = await player(origin);
  a.send({ type: "queue", event: "222" });
  b.send({ type: "queue", event: "444" });
  await Promise.all([a.next("queued"), b.next("queued")]);
  c.send({ type: "queue", event: "222" });
  await Promise.all([a.next("match"), c.next("match")]);
  expect((await b.next("queue")).searching).toBe(0);
});
