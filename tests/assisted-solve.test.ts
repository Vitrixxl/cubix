import { describe, expect, test } from "bun:test";
import { applyAlg, FACES, solved, type Face } from "../src/shared/cube";
import { REAL_HELD_HEX as HELD_HEX } from "../src/shared/cubeAppearance";
import { solveBeginner } from "../src/client/lib/beginnerSolver";
import { classify, scannedState, scanProblem, type Rgb } from "../src/client/lib/cubeScan";
import { allDone, colours, crossDone, edgesOriented, topDone } from "../src/client/lib/solveAnalysis";
import { ScrambleTracker } from "../src/client/lib/scrambleTracker";
import { canonicalTurn } from "../src/client/lib/smartCube";

/** Random face turns, from a fixed seed. */
function scramble(seed: number) {
  let x = seed;
  const random = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const turns: string[] = [];
  while (turns.length < 25) {
    const face = "UDFBRL"[Math.floor(random() * 6)]!;
    if (turns.at(-1)?.[0] === face) continue;
    turns.push(face + ["", "'", "2"][Math.floor(random() * 3)]);
  }
  return turns.join(" ");
}

describe("beginner solver", () => {
  test("solves random cubes with face turns only, step after step", () => {
    for (let seed = 1; seed <= 60; seed++) {
      let state = applyAlg(solved(3), scramble(seed));
      const parts = solveBeginner(state);
      expect(parts, `seed ${seed}`).not.toBeNull();
      const reached: number[] = [];
      for (const part of parts!) {
        expect(part.alg).toMatch(/^[UDFBRL](2|')?( [UDFBRL](2|')?)*$/);
        expect(part.step).toBeGreaterThanOrEqual(reached.at(-1) ?? 0);
        // The course's algorithm it is made of, but for the cross and the last turn of the top.
        if (part.step > 0 && part.label !== "Turn the top") {
          expect(part.gesture, `seed ${seed} ${part.label}`).toBeDefined();
          expect(part.gesture!.alg.split(" ").length * part.gesture!.times).toBeGreaterThanOrEqual(part.alg.split(" ").length - 2);
        }
        state = applyAlg(state, part.alg);
        reached.push(part.step);
      }
      const c = colours(state);
      expect(crossDone(c) && edgesOriented(c) && topDone(c) && allDone(c), `seed ${seed}`).toBe(true);
    }
  });

  test("a solved cube needs nothing; a cube one turn off needs little", () => {
    expect(solveBeginner(solved(3))).toEqual([]);
    expect(solveBeginner(applyAlg(solved(3), "D"))!.map((p) => p.alg).join(" ")).toBe("D'");
  });
});

describe("cube scan", () => {
  const hex = (face: Face): Rgb => [HELD_HEX[face] >> 16, (HELD_HEX[face] >> 8) & 255, HELD_HEX[face] & 255];
  const state = applyAlg(solved(3), scramble(7)),
    truth = colours(state);

  test("reads each sticker as the centre it looks most like, nine of each colour", () => {
    let x = 3;
    const noise = () => ((x = (x * 69069 + 1) % 4294967296) / 4294967296 - 0.5) * 40;
    // A warm light: every colour shifted the same way, each sticker a little off.
    const samples = truth.map((face) => hex(face).map((v, k) => Math.max(0, Math.min(255, v + [25, 5, -30][k]! + noise()))) as unknown as Rgb);
    expect(classify(samples)).toEqual(truth);
  });

  test("the colours read make the same cube", () => {
    expect(colours(scannedState(truth))).toEqual(truth);
    expect(scanProblem(truth)).toBeNull();
  });

  test("tells what is wrong with the colours", () => {
    const at = (c: Face[], slot: number, face: Face) => c.map((v, i) => (i === slot ? face : v));
    expect(scanProblem(truth.map((v, i) => (i === 0 ? null : v)))).toMatch(/no colour/);
    expect(scanProblem(at(truth, 0, truth[0] === "U" ? "D" : "U"))).toMatch(/nine/);
    // Two stickers of a corner swapped (a twisted corner), two of an edge (a flipped edge), two edges swapped.
    const swap = (c: Face[], a: number, b: number) => c.map((v, i) => (i === a ? c[b]! : i === b ? c[a]! : v));
    const solvedColours = colours(solved(3)),
      U = 0,
      B = 27,
      L = 45;
    // U0 is the corner of U, B and L: its U sticker, B's top right one, L's top left one.
    const twisted = solvedColours.map((v, i) => (i === U ? "L" : i === L ? "B" : i === B + 2 ? "U" : v)) as Face[];
    expect(scanProblem(twisted)).toMatch(/cannot be solved/);
    // U1 is the edge of U and B, B1 its other sticker.
    expect(scanProblem(swap(solvedColours, 1, B + 1))).toMatch(/cannot be solved/);
    expect(scanProblem(swap(swap(solvedColours, 1, 3), B + 1, L + 1))).toMatch(/cannot be solved/);
    expect(scanProblem(at(at(solvedColours, 0, "D"), FACES.indexOf("D") * 9, "U"))).toMatch(/do not exist/);
  });
});

test("the turns of a part are followed from the cube as it stands", () => {
  const start = applyAlg(solved(3), scramble(3)),
    part = solveBeginner(start)![0]!,
    turns = part.alg.split(" "),
    tracker = new ScrambleTracker(turns.map(canonicalTurn).join(" "), start, start);
  expect(tracker.progress.turns[0]).toBe("next");
  let state = start;
  for (const turn of turns) {
    state = applyAlg(state, turn);
    tracker.turn(canonicalTurn(turn), state);
  }
  expect(tracker.progress.scrambled).toBe(true);
});
