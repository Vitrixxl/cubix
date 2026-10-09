import { expect, test } from "bun:test";
import { DuelClient, type DuelHost } from "../src/client/lib/duel";

const host: DuelHost = {
  live: { send: () => true, on: () => () => {}, connected: () => true },
  changed() {},
  reset() {},
  scramble: async () => "R U",
  level: async () => null,
  record() {},
  fail() {},
};
const solve = { ms: 10000, penalty: "none" };
const state = (results: unknown[][]) => ({
  type: "state",
  game: 0,
  scrambles: ["a", "b", "c", "d", "e"],
  results,
  rematch: [false, false],
  present: [true, true],
});

test("the opponent's timer stops when their solve closes a round the player already finished", () => {
  const duel = new DuelClient(host);
  const receive = (m: object) => (duel as any).receive(m);
  receive({ type: "match", race: "r", seat: 0, host: false, event: "333", players: [{ name: "a" }, { name: "b" }] });
  receive(state([[solve, null, null, null, null], [null, null, null, null, null]]));
  receive({ type: "timer", phase: "running" });
  expect(duel.opponentPhase).toBe("running");
  receive(state([[solve, null, null, null, null], [solve, null, null, null, null]]));
  expect(duel.round).toBe(1);
  expect(duel.opponentPhase).toBe("idle");
});

test("the opponent's timer stops when they finish a round first", () => {
  const duel = new DuelClient(host);
  const receive = (m: object) => (duel as any).receive(m);
  receive({ type: "match", race: "r", seat: 0, host: false, event: "333", players: [{ name: "a" }, { name: "b" }] });
  receive(state([[null, null, null, null, null], [null, null, null, null, null]]));
  receive({ type: "timer", phase: "running" });
  receive(state([[null, null, null, null, null], [solve, null, null, null, null]]));
  expect(duel.opponentPhase).toBe("idle");
});
