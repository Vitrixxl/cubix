import { expect, test } from "bun:test";
import { cases } from "../src/client/local/catalog";
import { applyAlg, colorOf, faceOfSlot, slotsFor, solved, type CubeState } from "../src/shared/cube";
import { isPolyPuzzle, polyScene, type PolyPuzzle } from "../src/shared/puzzleScene";
import { puzzleOf } from "../src/shared/puzzles";
import { casePlayItem, executableAlg } from "../src/client/lib/caseState";
import { polyAlgScene, readAlg } from "../src/client/lib/algPlayer";

/**
 * The stickers a stage's algorithm must bring home: all of them, but for F2L the last layer's, and for OLL the last
 * layer's sides (its top only has to be of its colour, which `colorOf` checks).
 */
function goal(stage: string, size: number) {
  const top = (size - 1) / 2,
    slots = slotsFor(size).map((s, i) => ({ i, s }));
  if (stage === "F2L") return slots.filter(({ s }) => s.p[1] !== top).map(({ i }) => i);
  if (stage === "OLL") return slots.filter(({ s }) => s.p[1] !== top || s.n[1] === 1).map(({ i }) => i);
  return slots.map(({ i }) => i);
}
/** The 24 ways to hold a cube. */
const HOLDS = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) => ["", "y", "y2", "y'"].map((b) => `${a} ${b}`));
/** Whether the goal's stickers have their colour, however the cube is held and the last layer turned. */
const cubeSolves = (state: CubeState, size: number, slots: number[]) =>
  HOLDS.some((hold) => CUBE_AUF.some((auf) => {
    const end = applyAlg(state, `${hold} ${auf}`);
    return slots.every((slot) => colorOf(end, slot) === faceOfSlot(slot, size));
  }));

/** Each face of one colour: stickers grouped by where they face now. */
function polyLooksSolved(puzzle: PolyPuzzle, alg: string) {
  const scene = polyScene(puzzle, alg, false),
    faces = new Map<string, number>();
  return scene.stickers.every((s, i) => {
    const m = scene.states[0]![i]!,
      n = [0, 1, 2].map((r) => m[r * 3]! * s.normal[0]! + m[r * 3 + 1]! * s.normal[1]! + m[r * 3 + 2]! * s.normal[2]!),
      key = n.map((v) => Math.round(v * 100)).join();
    return (faces.get(key) ?? (faces.set(key, s.color), s.color)) === s.color;
  });
}

const AUF: Partial<Record<string, string[]>> = { pyram: ["", "U", "U'"], minx: ["", "U", "U'", "U2", "U2'"], skewb: [""], sq1: [""] };
const CUBE_AUF = ["", "U", "U2", "U'"];

test("every catalogue algorithm can be played in 3D and solves its case's setup, but for the last layer's turn", () => {
  const failures: string[] = [];
  let checked = 0;
  for (const c of cases) {
    const puzzle = puzzleOf(c);
    if (!casePlayItem(c)) {
      failures.push(`${c.id}: no 3D model`);
      continue;
    }
    for (const a of c.algorithms) {
      const alg = executableAlg(a);
      checked++;
      if (isPolyPuzzle(puzzle)) {
        if (!polyAlgScene(puzzle, alg) || !readAlg(c.setup, puzzle).ok) failures.push(`${c.id}: cannot play ${alg}`);
        else if (!AUF[puzzle]!.some((auf) => polyLooksSolved(puzzle, `${c.setup} ${alg} ${auf}`))) failures.push(`${c.id}: ${c.setup} | ${alg}`);
        continue;
      }
      const size = c.cube_size ?? 3,
        state = applyAlg(applyAlg(solved(size), c.setup), alg);
      if (!cubeSolves(state, size, goal(c.stage, size))) failures.push(`${c.id}: ${c.setup} | ${alg}`);
    }
  }
  expect(checked).toBeGreaterThan(1500);
  expect(failures).toEqual([]);
});

test("the other puzzles' algorithms play turn by turn, each turn lit on its written move", () => {
  const scene = polyAlgScene("sq1", "(1, 0) / (-3, -3) / (-1, 0)")!;
  // (1, 0) one turn, / one, (-3, -3) two, / one, (-1, 0) one.
  expect(scene.sources).toEqual([0, 1, 2, 2, 3, 4]);
  expect(readAlg("(1, 0) / (-1, 0)", "sq1").words.map((w) => w.map((p) => p.text).join(""))).toEqual(["(1, 0)", "/", "(-1, 0)"]);
  expect(polyAlgScene("minx", "R' F' BR' R BR")!.sources).toEqual([0, 1, 2, 3, 4]);
  expect(polyAlgScene("skewb", "R' L R L' y2")!.sources).toHaveLength(5);
  expect(polyAlgScene("pyram", "R ?")).toBeNull();
});
