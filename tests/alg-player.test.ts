import { describe, expect, test } from "bun:test";
import {
  advance, algScene, currentMove, currentSource, inverseAlg, pause, play, playMove, playableMoves, readAlg, restart, seek, startPlayback,
  stepBack, stepForward, nextSpeed,
} from "../src/client/lib/algPlayer";
import { cubeNotation, describeMove, notationView, PUZZLE_NOTATION } from "../src/client/lib/notation";
import { applyAlg, invertAlg, slotsFor, solved } from "../src/shared/cube";
import { FACE_HEX } from "../src/shared/cubeAppearance";
import { cases } from "../src/client/local/catalog";
import { executableAlg, maskForStage } from "../src/client/lib/caseState";
import { METHODS } from "../src/shared/methods";
import { puzzleInfo } from "../src/shared/puzzles";

const played = (alg: string) => readAlg(alg).moves.map((m) => m.token).join(" ");
const shown = (alg: string) => readAlg(alg).words.map((w) => w.map((p) => (p.move === undefined ? p.text : `<${p.text}>`)).join(""));

describe("reading an algorithm", () => {
  test("moves keep their written index; brackets are marks around them", () => {
    expect(shown("R U (R' U') R2")).toEqual(["<R>", "<U>", "(<R'>", "<U'>)", "<R2>"]);
    const read = readAlg("(R U)2 R'");
    expect(read.words.flat().filter((p) => p.move !== undefined).map((p) => p.move)).toEqual([0, 1, 2]);
    expect(read.moves.map((m) => m.source)).toEqual([0, 1, 0, 1, 2]);
    expect(read.ok).toBe(true);
  });
  test("wide moves, slices, rotations and double primes", () => {
    expect(played("r U Rw' 3Rw2 2R M' E2 S x y' z2 U2'")).toBe("r U Rw' 3Rw2 2R M' E2 S x y' z2 U2'");
    expect(playableMoves("Rw r", 3)!.map((m) => m.layers)).toEqual([[1, 0], [1, 0]]);
    expect(playableMoves("3Rw", 5)!.map((m) => m.layers)).toEqual([[2, 1, 0]]);
    expect(playableMoves("2R", 4)!.map((m) => m.layers)).toEqual([[0.5]]);
    expect(playableMoves("M E S", 3)!.map((m) => m.axis)).toEqual([0, 1, 2]);
    expect(playableMoves("x y z", 3)!.every((m) => m.layers.length === 3)).toBe(true);
    // A half turn primed is still a half turn.
    expect(playableMoves("U2'", 3)![0]!.q).toBe(2);
  });
  test("repeats, primed groups, square brackets, commutators and conjugates", () => {
    expect(played("(R U R' U')2")).toBe("R U R' U' R U R' U'");
    expect(played("(R U)'")).toBe("U' R'");
    expect(played("[R U] F")).toBe("R U F");
    expect(played("[R, U]")).toBe("R U R' U'");
    expect(played("[F: R U R' U']")).toBe("F R U R' U' F'");
    expect(played("(U) R U R'")).toBe("U R U R'");
    expect(shown("(R U R' U')2")).toEqual(["(<R>", "<U>", "<R'>", "<U'>)2"]);
  });
  test("unknown text is shown but not played", () => {
    expect(readAlg("R++ D--").ok).toBe(false);
    expect(readAlg("(1, 0) /").ok).toBe(false);
    expect(playableMoves("R U R'", 3)).toHaveLength(3);
    expect(playableMoves("R ?", 3)).toBeNull();
    expect(algScene("UR3+", 3)).toBeNull();
    // A wide move deeper than the cube does not exist on it.
    expect(playableMoves("4Rw", 3)).toBeNull();
  });
  test("the inverse undoes the algorithm, groups included", () => {
    for (const alg of ["R U R' U'", "(R U R' U')2", "r U R' U' r' F R F'", "M2 U M2 U2 M2 U M2", "x R2 D2 R U R' D2 R U' R x'", "[R, U] y (R U)'", "U2' Rw2"]) {
      expect(Array.from(applyAlg(applyAlg(solved(3), inverseAlg(alg)), played(alg)))).toEqual(Array.from(solved(3)));
    }
    expect(inverseAlg("R U2' 3Rw'")).toBe("3Rw U2 R'");
    expect(inverseAlg("(R U)2")).toBe(invertAlg("(R U)2"));
  });
});

describe("the case scene", () => {
  test("starts on the case, plays each move and ends solved", () => {
    const scene = algScene("R U R' U R U2 R'", 3, "OLL")!;
    expect(scene.moves).toHaveLength(7);
    expect(scene.states).toHaveLength(8);
    expect(scene.states[0]).toEqual(Array.from(applyAlg(solved(3), "R U2 R' U' R U' R'")));
    expect(scene.states.at(-1)).toEqual(Array.from(solved(3)));
  });
  test("every catalogue algorithm and every method algorithm on a cube can be played", () => {
    for (const c of cases.filter((c) => !c.diagram)) {
      const size = c.cube_size ?? 3;
      for (const a of c.algorithms) {
        const scene = algScene(executableAlg(a), size, maskForStage(c.stage));
        expect(scene, `${c.id}: ${a.alg}`).not.toBeNull();
        expect(scene!.states.at(-1), c.id).toEqual(Array.from(solved(size)));
      }
    }
    for (const [puzzle, methods] of Object.entries(METHODS)) {
      const size = puzzleInfo(puzzle as never).cubeSize;
      if (!size) continue;
      for (const step of methods.flatMap((m) => m.steps))
        for (const a of step.algs ?? []) for (const alg of [a.alg, ...(a.alternatives ?? [])]) expect(algScene(alg, size, step.mask), alg).not.toBeNull();
    }
  });
});

describe("the playback clock", () => {
  test("plays to the end, pauses after the turn in progress, restarts from the end", () => {
    let p = play(startPlayback(), 4);
    p = advance(p, 0.75);
    expect(p.position).toBeCloseTo(1.5);
    expect(currentMove(p)).toBe(1);
    p = pause(p);
    expect(p.target).toBe(2);
    p = advance(p, 10);
    expect(p).toMatchObject({ position: 2, target: 2, playing: false });
    expect(currentMove(p)).toBe(1);
    p = advance(play(p, 4), 10);
    expect(p).toMatchObject({ position: 4, playing: false });
    expect(play(p, 4)).toMatchObject({ position: 0, target: 4, playing: true });
  });
  test("steps turn one move either way; seeking settles on a whole move; a move plays alone", () => {
    let p = stepForward(startPlayback(), 3);
    expect(p.target).toBe(1);
    p = advance(p, 10);
    expect(stepBack(p).target).toBe(0);
    expect(stepBack(restart(p)).target).toBe(0);
    expect(stepForward({ ...p, position: 3, target: 3 }, 3).target).toBe(3);
    expect(seek(p, 1.6, 3, true)).toMatchObject({ position: 1.6, target: 2 });
    expect(seek(p, 9, 3)).toMatchObject({ position: 3, target: 3 });
    expect(playMove(p, 2, 3)).toMatchObject({ position: 2, target: 3 });
    expect(currentMove(startPlayback())).toBe(-1);
    expect(currentSource({ sources: [0, 1, 0, 1] }, { position: 2.5, target: 4, playing: true, speed: 1 })).toBe(0);
  });
  test("speed doubles the pace and cycles", () => {
    expect(advance(play({ ...startPlayback(), speed: 2 }, 8), 0.5).position).toBeCloseTo(2);
    expect([nextSpeed(0.25), nextSpeed(0.5), nextSpeed(1), nextSpeed(2)]).toEqual([0.5, 1, 2, 0.25]);
  });
});

describe("the notation guide", () => {
  test("every cube move tile plays on its cube, seen from the side it turns", () => {
    for (const size of [2, 3, 4, 7]) {
      const groups = cubeNotation(size);
      for (const block of groups.flatMap((g) => g.blocks)) {
        expect(block.variants).toEqual([block.move, block.move + "'", block.move + "2"]);
        for (const move of block.variants) {
          expect(algScene(move, size, "full", ""), `${size}: ${move}`).not.toBeNull();
          expect(describeMove(move, size).toLowerCase()).toContain(block.text.toLowerCase());
        }
      }
      expect(groups.some((g) => g.title === "Slices")).toBe(size >= 3);
    }
    expect(describeMove("R'", 3)).toBe("Right: the right face, counter-clockwise");
    expect(describeMove("y2", 3)).toBe("The whole cube, turning like U, half turn");
    expect(notationView("L").yaw).toBeLessThan(0);
    expect(notationView("D").pitch).toBeLessThan(0);
    expect(notationView("B").yaw).toBeGreaterThan(Math.PI / 2);
  });
  test("each other puzzle has its own notation", () => {
    expect(Object.keys(PUZZLE_NOTATION).sort()).toEqual(["minx", "pyram", "skewb", "sq1"]);
  });
});

test("a move shown from a solved cube starts in the usual colours, centres included", () => {
  const scene = algScene("M", 3, "full", "")!;
  const top = slotsFor(3).findIndex((g) => g.n[1] === 1 && g.p[0] === 0 && g.p[2] === 0);
  expect(scene.colors[scene.states[0]![top]!]).toBe(FACE_HEX.U);
  // A case too, as its diagram shows it: an algorithm opening on a rotation starts in the usual colours.
  expect(algScene("x", 3)!.colors[algScene("x", 3)!.states[0]![top]!]).toBe(FACE_HEX.U);
});

test("a case opening on a rotation starts as its diagram, blue in front", () => {
  const front = slotsFor(3).findIndex((g) => g.n[2] === 1 && g.p[0] === 0 && g.p[1] === 0);
  const scene = algScene("y' U' R' U2 R U' R' U R", 3, "F2L")!;
  expect(scene.colors[scene.states[0]![front]!]).toBe(FACE_HEX.F);
});
