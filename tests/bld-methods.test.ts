import { expect, test } from "bun:test";
import { cases, sets } from "../src/client/local/catalog";
import { BLD_METHODS, METHODS } from "../src/shared/methods";
import { applyAlg, solved, type CubeState } from "../src/shared/cube";
import { puzzleOf, type PuzzleId } from "../src/shared/puzzles";
import { DEFAULT_BUFFERS, SPEFFZ, commOf, traceMemo, type BldBuffers } from "../src/client/lib/bld";
import { methodOf, methodsFor, recommendedMethod, stepId } from "../src/client/lib/course";

const find = (id: string) => cases.find((c) => c.id === id);
const alg = (id: string) => find(id)!.algorithms[0]!.alg;
const step = (method: string, title: string) => BLD_METHODS["333"]!.find((m) => m.id === method)!.steps.find((s) => s.title === title)!;

test("a blindfolded event offers its blindfolded methods, a sighted one the puzzle's", () => {
  expect(methodsFor("333", "blindfolded").map((m) => m.id)).toEqual(["old-pochmann", "m2", "3-style"]);
  expect(methodsFor("333", "multi-blind")).toBe(methodsFor("333", "blindfolded"));
  expect(methodsFor("333", "one-handed")).toBe(METHODS["333"]);
  expect(recommendedMethod("333", "blindfolded")).toBe("old-pochmann");
  expect(recommendedMethod("444", "blindfolded")).toBe("r2-op");
  expect(recommendedMethod("333")).toBe("beginner");
  // A course's link opens whatever the event; switching event keeps only its own methods.
  expect(methodOf("333", "m2")?.name).toBe("M2 and Old Pochmann");
  expect(methodOf("333", "m2", "standard")).toBeUndefined();
  expect(methodOf("333", "cfop", "blindfolded")).toBeUndefined();
  for (const [puzzle, methods] of Object.entries(BLD_METHODS) as [PuzzleId, typeof METHODS["333"]][])
    for (const method of methods) {
      expect(METHODS[puzzle].some((m) => m.id === method.id), method.id).toBe(false);
      expect(new Set(method.steps.map(stepId)).size, method.id).toBe(method.steps.length);
      for (const s of method.steps) {
        expect(!!s.sets?.length || !!s.algs?.length || !!s.tips?.length, `${method.id} · ${s.title}`).toBe(true);
        for (const id of s.sets ?? []) expect(puzzleOf(sets.find((set) => set.id === id)!), id).toBe(puzzle);
      }
    }
});

/** Scrambles from a fixed seed, kept to those with no piece turned in its place (a separate trick the course leaves to the memo). */
function* scrambles(buffers: BldBuffers, count = 150) {
  let seed = 7;
  const next = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
  for (let i = 0; i < count; i++) {
    const state = applyAlg(solved(3), Array.from({ length: 25 }, () => "RLUDFB"[next(6)]! + ["", "'", "2"][next(3)]).join(" "));
    const [edges, corners] = traceMemo(state, SPEFFZ, buffers);
    if (!edges!.turned.length && !corners!.turned.length) yield { state, edges: edges!.targets, corners: corners!.targets };
  }
}
const isSolved = (state: CubeState) => state.every((v, i) => v === i);

test("Old Pochmann solves a scramble: each edge by its setup and the T perm, the parity when odd, each corner by the Y perm", () => {
  const parity = step("old-pochmann", "Parity").algs![0]!.alg;
  for (const { state, edges, corners } of scrambles({ ...DEFAULT_BUFFERS, edges: "UR", corners: "UBL" })) {
    let cube = state;
    for (const l of edges) cube = applyAlg(cube, alg(`UR ${l}`));
    if (edges.length % 2) cube = applyAlg(cube, parity);
    for (const l of corners) cube = applyAlg(cube, alg(`UBL ${l}`));
    expect(isSolved(cube)).toBe(true);
  }
});

test("M2 solves the edges, every second C, W, I and S read as its opposite, then its parity and Old Pochmann's corners", () => {
  const parity = step("m2", "Parity").algs![0]!.alg, opposite: Record<string, string> = { C: "W", W: "C", I: "S", S: "I" };
  for (const { state, edges, corners } of scrambles({ ...DEFAULT_BUFFERS, edges: "DF", corners: "UBL" })) {
    let cube = state;
    edges.forEach((l, i) => (cube = applyAlg(cube, alg(`DF ${i % 2 ? opposite[l] ?? l : l}`))));
    if (edges.length % 2) cube = applyAlg(cube, parity);
    for (const l of corners) cube = applyAlg(cube, alg(`UBL ${l}`));
    expect(isSolved(cube)).toBe(true);
  }
});

test("3-style solves pairs by commutators, an odd last edge with UR and the last corner by its parity algorithm", () => {
  for (const { state, edges, corners } of scrambles(DEFAULT_BUFFERS)) {
    // A last edge on UR itself needs another trick.
    if (edges.length % 2 && ["B", "M"].includes(edges.at(-1)!)) continue;
    const e = edges.length % 2 ? [...edges, "B"] : edges, last = corners.length % 2 ? corners.at(-1) : undefined;
    let cube = state;
    for (let i = 0; i < e.length; i += 2) cube = applyAlg(cube, commOf(`UF ${e[i]}${e[i + 1]}`, "edges", find)!.alg);
    for (let i = 0; i + 1 < corners.length; i += 2) cube = applyAlg(cube, commOf(`UFR ${corners[i]}${corners[i + 1]}`, "corners", find)!.alg);
    if (last) cube = applyAlg(cube, alg(`Parity UFR ${last}`));
    expect(isSolved(cube)).toBe(true);
  }
});
