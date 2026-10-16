import { expect, test } from "bun:test";
import { Alg } from "cubing/alg";
import { cube3x3x3, puzzles } from "cubing/puzzles";
import { patternAfter } from "../src/shared/crossTraining";
import { scrambler } from "./scrambler";

/** The WebAssembly scrambler as the apps load it, checked against cubing.js's own puzzle models. */
const EVENTS: Record<string, string> = { "222": "2x2x2", "333": "3x3x3", "333oh": "3x3x3", "333bf": "3x3x3", "333fm": "3x3x3", "333mbf": "3x3x3", "444": "4x4x4", "444bf": "4x4x4", "555": "5x5x5", "555bf": "5x5x5", "666": "6x6x6", "777": "7x7x7", minx: "megaminx", pyram: "pyraminx", skewb: "skewb", sq1: "square1", clock: "clock" };

test("every event's scramble is valid notation that its puzzle plays", async () => {
  for (const [event, puzzle] of Object.entries(EVENTS)) {
    const kpuzzle = await puzzles[puzzle]!.kpuzzle();
    for (let i = 0; i < 20; i++) {
      const scramble = await scrambler.randomScrambleForEvent(event);
      const played = kpuzzle.defaultPattern().applyAlg(new Alg(scramble));
      expect(played.isIdentical(kpuzzle.defaultPattern()), `${event}: ${scramble}`).toBe(false);
    }
  }
  expect(scrambler.randomScrambleForEvent("fto")).rejects.toThrow();
}, 60000);

test("a 3×3 state's scramble reaches it, the same every time", async () => {
  const kpuzzle = await cube3x3x3.kpuzzle();
  for (let i = 0; i < 100; i++) {
    const state = patternAfter(await scrambler.randomScrambleForEvent("333"));
    const scramble = await scrambler.patternScramble(state);
    expect(scramble.split(" ").length).toBeLessThanOrEqual(21);
    expect(await scrambler.patternScramble(state)).toBe(scramble);
    const reached = kpuzzle.defaultPattern().applyAlg(scramble).patternData;
    expect([reached.EDGES, reached.CORNERS]).toEqual([state.EDGES, state.CORNERS]);
  }
  expect(await scrambler.patternScramble(patternAfter(""))).toBe("");
  const flipped = patternAfter("");
  flipped.EDGES.orientation[0] = 1;
  expect(scrambler.patternScramble(flipped)).rejects.toThrow();
});

test("an orbit's scramble leaves the other orbit solved", async () => {
  for (const orbit of ["EDGES", "CORNERS"] as const) {
    for (let i = 0; i < 20; i++) {
      const state = patternAfter(await scrambler.orbitScramble(orbit));
      const other = orbit === "EDGES" ? state.CORNERS : state.EDGES;
      expect(other.pieces).toEqual([...other.pieces.keys()]);
      expect(other.orientation.every(o => o === 0)).toBe(true);
    }
  }
});
